/**
 * 单侧渲染：Markdown → 带高亮的 DOM → 逐块原子。
 *
 * 只有这一层碰 DOM（含消毒与节点克隆），其余算法都是纯函数。
 * 任何一步对不上（解析偏移、原子数、消毒后结构），就退回「整篇一块」
 * 并置 `blocksOk = false`，由上层显示降级提示。
 */

import DOMPurify from 'dompurify'
import { marked } from 'marked'

import { lexBlocks, orderedStartValue, planAtomEntries } from './blocks.js'
import { buildInjectPlan, injectMarks } from './inject.js'

/** 顶层子节点的最小描述，喂给纯函数 `planAtomEntries`。 */
function describeChildren(container) {
  return Array.from(container.children).map((node) => ({
    tagName: node.tagName,
    childTags: Array.from(node.children).map((child) => child.tagName),
  }))
}

/** 把已消毒的 HTML 变成节点，用于在拆块前做结构修正。 */
function holderFromSanitizedHtml(safeHtml) {
  const holder = document.createElement('div')
  holder.className = 'rendered'
  holder.innerHTML = safeHtml
  return holder
}

/**
 * 执行拆分：每项装进只含该项的列表容器副本，保留标签、class 与列表记号。
 * 有序列表逐项写回 `start`，保证编号与原来的单一列表一致。
 */
function applyAtoms(container, plan, spans) {
  const children = Array.from(container.children)
  const atoms = []

  for (const entry of plan.entries) {
    const node = children[entry.index]
    const span = spans[atoms.length]
    if (!entry.split) {
      atoms.push({ start: span.start, end: span.end, html: node.outerHTML })
      continue
    }

    const base = node.tagName === 'OL' ? orderedStartValue(node.getAttribute('start')) : 0
    const items = Array.from(node.children)
    items.forEach((item, k) => {
      const single = node.cloneNode(false)
      if (single.tagName === 'OL') single.setAttribute('start', String(base + k))
      single.appendChild(item)
      const itemSpan = spans[atoms.length]
      atoms.push({ start: itemSpan.start, end: itemSpan.end, html: single.outerHTML })
    })
  }

  return atoms
}

/**
 * 渲染一侧正文，并按顶层块切成原子。
 *
 * @param {string} body 正文（不含标题）
 * @param {Array<{start:number,end:number,rid:string,kind:string}>} spans 该侧全部差异区间
 * @returns {{atoms: Array<{start:number,end:number,html:string}>, blocksOk: boolean}}
 */
export function renderSide(body, spans) {
  const source = body || ''
  const { blocks: injectPlan } = buildInjectPlan(source, spans || [])
  const html = marked.parse(injectMarks(source, injectPlan), { gfm: true, breaks: false })

  // 消毒交给 DOMPurify：脚本与内联事件不执行，`mark` 与 `data-*` 保留；
  // 下面写入 DOM 的内容都是这份消毒结果，不再直接碰原文
  const holder = holderFromSanitizedHtml(DOMPurify.sanitize(html))

  // 图片高亮里唯一的子节点是 <img>，背景与下边框会被完全盖住，
  // 只能靠结构判定，走不参与布局的轮廓通道
  for (const mark of holder.querySelectorAll('mark.hl')) {
    if (mark.querySelector('img')) mark.classList.add('hl-image')
  }

  // 正文里的链接一律新窗口打开，避免把只读页面导航走
  for (const anchor of holder.querySelectorAll('a[href]')) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }

  // 图片一律不带 Referer：跨站图床（如微信 mmbiz）按 Referer 白名单防盗链，
  // 应用域名不在白名单里时返回「未经允许不可引用」占位图。属性只能在这里补，
  // DOMPurify 的默认属性白名单不含 referrerpolicy，写在原文里会被消毒剥掉。
  // 逐块 outerHTML 与降级时的整篇 innerHTML 都从这份 holder 取，两条路径都带上。
  for (const image of holder.querySelectorAll('img')) {
    image.setAttribute('referrerpolicy', 'no-referrer')
  }

  const lexSpans = lexBlocks(source)
  const atomPlan = planAtomEntries(describeChildren(holder))
  const fallback = [{ start: 0, end: source.length, html: holder.innerHTML }]

  if (!lexSpans || lexSpans.length !== atomPlan.count) {
    return { atoms: fallback, blocksOk: false }
  }

  return { atoms: applyAtoms(holder, atomPlan, lexSpans), blocksOk: true }
}
