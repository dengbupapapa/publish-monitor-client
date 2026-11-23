<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import DiffRow from './DiffRow.vue'
import RecordCard from './RecordCard.vue'
import { drawWires } from '@/diff/wires'

import '@/styles/diff.css'

const props = defineProps({
  article: { type: Object, required: true },
  records: { type: Array, required: true },
  /** { reference: {atoms, blocksOk}, input: {atoms, blocksOk} } */
  sides: { type: Object, required: true },
  /** [{ reference: 块号| -1, input: 块号| -1 }] */
  rows: { type: Array, required: true },
  /** 非空表示降级：按块序配对，并说明原因 */
  reason: { type: String, default: '' },
})

const rowsScroll = ref(null)
const rowsBody = ref(null)
const wiresSvg = ref(null)
const recordsBody = ref(null)

/** 选中的记录标识；悬停只是临时强调，不改选中 */
const activeRid = ref(null)
const hoverRid = ref(null)
const activeIndex = ref(null)
/** 下一条要跳到第几个命中行（0 基） */
const nextIndex = ref(0)
/** 当前展示的是第几个命中行 */
const shownIndex = ref(0)
/** rid → 命中行号数组 */
const anchorRows = ref({})

const emphasisRid = computed(() => hoverRid.value ?? activeRid.value)

const kindByRid = computed(() => new Map(props.records.map((record) => [record.id, record.kind])))

// 零差异时不该出现降级提示：没有记录要标注，块序配对就够用
const showReason = computed(() => (props.records.length ? props.reason : ''))

const noAnchorCount = computed(
  () => props.records.filter((record) => !(anchorRows.value[record.id]?.length)).length,
)

const recordCountText = computed(() => {
  if (!props.records.length) return '两侧一致'
  const base = `共 ${props.records.length} 条`
  return noAnchorCount.value ? `${base} · 无可定位 ${noAnchorCount.value} 条` : base
})

function sideMeta(side) {
  const body = props.article[`${side}_body`] || ''
  const marks = props.records.reduce((sum, record) => sum + record[side].count, 0)
  return `${body.length} 字符 · ${marks} 处差异`
}

const refMeta = computed(() => sideMeta('reference'))
const inpMeta = computed(() => sideMeta('input'))

function markRids(mark) {
  return (mark.getAttribute('data-rids') || '').split(' ').filter(Boolean)
}

/** 重新统计每条记录落在哪些行上；「无可定位」与游标都依赖它 */
function measureAnchors() {
  const body = rowsBody.value
  const map = {}
  if (!body) {
    anchorRows.value = map
    return
  }

  Array.from(body.querySelectorAll('.row')).forEach((rowEl, index) => {
    for (const mark of rowEl.querySelectorAll('mark.hl')) {
      for (const rid of markRids(mark)) {
        if (!map[rid]) map[rid] = []
        if (map[rid][map[rid].length - 1] !== index) map[rid].push(index)
      }
    }
  })

  anchorRows.value = map
}

/** 强调态：高亮、行、连线三处同时生效 */
function applyEmphasis() {
  const rid = emphasisRid.value
  const body = rowsBody.value
  if (!body) return

  if (rid) body.setAttribute('data-active-rid', rid)
  else body.removeAttribute('data-active-rid')

  for (const mark of body.querySelectorAll('mark.hl')) {
    mark.classList.toggle('is-active', !!rid && markRids(mark).includes(rid))
  }
  for (const rowEl of body.querySelectorAll('.row')) {
    rowEl.classList.toggle('selected', !!rid && !!rowEl.querySelector('mark.hl.is-active'))
  }
  for (const node of wiresSvg.value?.querySelectorAll('path, circle') || []) {
    node.classList.toggle('is-active', !!rid && node.getAttribute('data-rid') === rid)
  }
}

function paintWires() {
  drawWires({
    bodyEl: rowsBody.value,
    svgEl: wiresSvg.value,
    kindOf: (rid) => kindByRid.value.get(rid),
    onSelect: (rid) => selectRecord(rid),
    onHover: (rid) => {
      hoverRid.value = rid
    },
  })
  // 连线是整层重画，强调态要跟着补回去
  applyEmphasis()
}

// 挂载、尺寸变化、图片就绪、字体就绪、窗口缩放都合并成一次重绘。
// 用 setTimeout 而不是 rAF：后台标签页里 rAF 不跑，连线会一直缺着。
let wireTimer = null
function scheduleWires() {
  if (wireTimer) return
  wireTimer = setTimeout(() => {
    wireTimer = null
    paintWires()
  }, 0)
}

function scrollToRow(rowIndex) {
  const scrollEl = rowsScroll.value
  const rowEl = rowsBody.value?.querySelectorAll('.row')[rowIndex]
  if (!scrollEl || !rowEl) return
  const top = rowEl.offsetTop + rowEl.offsetHeight / 2 - scrollEl.clientHeight / 2
  scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

function revealCard(rid) {
  const card = recordsBody.value?.querySelector(`[data-rid="${CSS.escape(rid)}"]`)
  card?.scrollIntoView({ block: 'nearest' })
}

/**
 * 选中一条记录。
 *
 * `advance` 表示从卡片点进来：滚动到当前命中行并把游标推进到下一行；
 * `reveal === 'card'` 表示从正文点进来：只把卡片滚进视野，不动正文。
 */
function selectRecord(rid, { reveal = '', advance = false } = {}) {
  if (rid !== activeRid.value) {
    nextIndex.value = 0
    shownIndex.value = 0
  }

  activeRid.value = rid
  const index = props.records.findIndex((record) => record.id === rid)
  activeIndex.value = index >= 0 ? index : null

  const hits = anchorRows.value[rid] || []
  if (advance && hits.length) {
    const k = nextIndex.value % hits.length
    shownIndex.value = k
    scrollToRow(hits[k])
    nextIndex.value = (k + 1) % hits.length
  }
  if (reveal === 'card') revealCard(rid)
}

function onRowsClick(event) {
  const mark = event.target.closest?.('mark.hl')
  if (!mark) return
  const rid = markRids(mark)[0]
  if (rid) selectRecord(rid, { reveal: 'card' })
}

function onRowsOver(event) {
  const mark = event.target.closest?.('mark.hl')
  if (!mark) return
  hoverRid.value = markRids(mark)[0] || null
}

function onRowsOut(event) {
  const mark = event.target.closest?.('mark.hl')
  if (!mark) return
  const to = event.relatedTarget
  // 在同一处高亮内部移动不算离开
  if (to && to.closest && to.closest('mark.hl') === mark) return
  hoverRid.value = null
}

function onMediaSettled() {
  // 图片落位会改行高，锚点与连线都得重算
  measureAnchors()
  scheduleWires()
}

let resizeObserver = null

function teardown() {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', scheduleWires)
  rowsBody.value?.removeEventListener('load', onMediaSettled, true)
  rowsBody.value?.removeEventListener('error', onMediaSettled, true)
  if (wireTimer) clearTimeout(wireTimer)
  wireTimer = null
}

onMounted(async () => {
  await nextTick()
  measureAnchors()
  paintWires()

  if (typeof ResizeObserver !== 'undefined' && rowsBody.value) {
    resizeObserver = new ResizeObserver(() => {
      measureAnchors()
      scheduleWires()
    })
    resizeObserver.observe(rowsBody.value)
  }
  rowsBody.value?.addEventListener('load', onMediaSettled, true)
  rowsBody.value?.addEventListener('error', onMediaSettled, true)
  window.addEventListener('resize', scheduleWires)
  document.fonts?.ready?.then(() => scheduleWires())
})

onBeforeUnmount(teardown)

watch(emphasisRid, applyEmphasis)

// 换一篇文章：清掉选中与游标，重新量锚点、画连线
watch(
  () => props.rows,
  async () => {
    activeRid.value = null
    hoverRid.value = null
    activeIndex.value = null
    nextIndex.value = 0
    shownIndex.value = 0
    await nextTick()
    measureAnchors()
    scheduleWires()
  },
)
</script>

<template>
  <div class="workspace">
    <p v-if="showReason" class="degraded">未逐行对齐：{{ showReason }}，已按块序配对呈现。</p>

    <div class="workspace-body">
      <section class="compare">
        <div class="compare-head">
          <div class="head-cell">
            <div class="head-side">参考侧</div>
            <div class="head-title" :class="{ empty: !article.reference_title }">
              {{ article.reference_title || '（无标题）' }}
            </div>
            <div class="head-meta">{{ refMeta }}</div>
          </div>
          <div class="head-mid"></div>
          <div class="head-cell">
            <div class="head-side">发布侧</div>
            <div class="head-title" :class="{ empty: !article.input_title }">
              {{ article.input_title || '（无标题）' }}
            </div>
            <div class="head-meta">{{ inpMeta }}</div>
          </div>
        </div>

        <div ref="rowsScroll" class="rows-scroll">
          <div
            ref="rowsBody"
            class="rows-body"
            @click="onRowsClick"
            @mouseover="onRowsOver"
            @mouseout="onRowsOut"
          >
            <DiffRow
              v-for="(row, index) in rows"
              :key="index"
              :row="row"
              :ref-atoms="sides.reference.atoms"
              :inp-atoms="sides.input.atoms"
            />
            <p v-if="!rows.length" class="rows-empty">两侧都没有可显示的内容。</p>
            <svg ref="wiresSvg" class="wires" aria-hidden="true"></svg>
          </div>
        </div>
      </section>

      <aside class="records">
        <div class="records-head">
          <span>差异记录</span>
          <span class="records-count">{{ recordCountText }}</span>
        </div>
        <div ref="recordsBody" class="records-body">
          <p v-if="!records.length" class="records-empty">两侧一致，没有需要标注的差异。</p>
          <RecordCard
            v-for="(record, index) in records"
            :key="record.id"
            :record="record"
            :active="activeIndex === index"
            :row-count="anchorRows[record.id]?.length || 0"
            :shown-index="activeIndex === index ? shownIndex : 0"
            @focus="selectRecord(record.id, { reveal: 'row', advance: true })"
          />
        </div>
      </aside>
    </div>
  </div>
</template>
