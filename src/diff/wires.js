/**
 * 差异连线：把同一记录两侧的高亮连起来。
 *
 * 连线画在覆盖整个滚动内容的 SVG 上，因此可以跨行；坐标以
 * `.rows-body` 为原点取纵向中心，滚动时不变形（滚动不重算）。
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 中缝宽度，取不到 .mid 时的兜底。 */
const GUTTER = 56

/** 高亮上携带的记录标识（空格分隔）。 */
function markRids(mark) {
  return (mark.getAttribute('data-rids') || '').split(' ').filter(Boolean)
}

/**
 * 每条记录两侧高亮的纵向中心；坐标原点是 `.rows-body` 上沿，与滚动位置无关。
 *
 * @param {HTMLElement} body
 * @param {DOMRect} origin
 * @returns {Map<string, {reference:number[], input:number[]}>}
 */
function centresByRid(body, origin) {
  const groups = new Map()
  for (const mark of body.querySelectorAll('mark.hl')) {
    const side = mark.closest('[data-side]')?.getAttribute('data-side')
    if (side !== 'reference' && side !== 'input') continue
    const rect = mark.getBoundingClientRect()
    const centre = (rect.top + rect.bottom) / 2 - origin.top
    for (const rid of markRids(mark)) {
      if (!groups.has(rid)) groups.set(rid, { reference: [], input: [] })
      groups.get(rid)[side].push(centre)
    }
  }
  return groups
}

/** 端点小圆：实心表示该侧真有高亮，空心表示这一侧是虚线半线。 */
function createDot(x, y, kind, filled, rid) {
  const dot = document.createElementNS(SVG_NS, 'circle')
  dot.setAttribute('cx', x.toFixed(1))
  dot.setAttribute('cy', y.toFixed(1))
  dot.setAttribute('r', '3.2')
  dot.setAttribute('fill', filled ? 'currentColor' : 'none')
  dot.setAttribute('stroke', 'currentColor')
  dot.setAttribute('stroke-width', '1.6')
  dot.setAttribute('class', kind)
  dot.setAttribute('data-rid', rid)
  dot.setAttribute('data-filled', filled ? '1' : '0')
  return dot
}

/**
 * 重画全部连线。
 *
 * @param {object} options
 * @param {HTMLElement|null} options.bodyEl `.rows-body`
 * @param {SVGSVGElement|null} options.svgEl 覆盖层
 * @param {(rid:string)=>string} [options.kindOf] 记录的变化方向，决定颜色
 * @param {(rid:string)=>void} [options.onSelect] 点击连线
 * @param {(rid:string|null)=>void} [options.onHover] 悬停连线
 */
export function drawWires({ bodyEl, svgEl, kindOf, onSelect, onHover } = {}) {
  if (!bodyEl || !svgEl) return
  svgEl.replaceChildren()

  const width = bodyEl.clientWidth
  const height = bodyEl.clientHeight
  if (!width || !height) return
  svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`)

  const origin = bodyEl.getBoundingClientRect()
  const mid = bodyEl.querySelector('.row .mid')
  let left
  let right
  if (mid) {
    const rect = mid.getBoundingClientRect()
    left = rect.left - origin.left
    right = rect.right - origin.left
  } else {
    left = (width - GUTTER) / 2
    right = left + GUTTER
  }

  const x1 = left + 4
  const x2 = right - 4
  const bend1 = x1 + (x2 - x1) * 0.35
  const bend2 = x1 + (x2 - x1) * 0.65

  for (const [rid, group] of centresByRid(bodyEl, origin)) {
    const lefts = group.reference.slice().sort((a, b) => a - b)
    const rights = group.input.slice().sort((a, b) => a - b)
    const total = Math.max(lefts.length, rights.length)
    const kind = kindOf?.(rid) || 'replaced'

    for (let k = 0; k < total; k += 1) {
      const hasLeft = k < lefts.length
      const hasRight = k < rights.length
      // 只有一侧有内容时，另一端的 y 取这一侧的值，画成一条半线
      const y1 = hasLeft ? lefts[k] : rights[k]
      const y2 = hasRight ? rights[k] : lefts[k]

      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute(
        'd',
        `M ${x1} ${y1.toFixed(1)} C ${bend1.toFixed(1)} ${y1.toFixed(1)}, ${bend2.toFixed(1)} ${y2.toFixed(1)}, ${x2} ${y2.toFixed(1)}`,
      )
      path.setAttribute('class', kind)
      path.setAttribute('data-rid', rid)
      if (!hasLeft || !hasRight) path.setAttribute('stroke-dasharray', '4 3')
      path.addEventListener('click', () => onSelect?.(rid))
      path.addEventListener('mouseenter', () => onHover?.(rid))
      path.addEventListener('mouseleave', () => onHover?.(null))

      svgEl.appendChild(path)
      svgEl.appendChild(createDot(x1, y1, kind, hasLeft, rid))
      svgEl.appendChild(createDot(x2, y2, kind, hasRight, rid))
    }
  }
}
