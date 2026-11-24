<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { DEFAULT_LIMIT, listMatchResults, WARN_SCOPE } from '@/api/matchResults'
import { KIND_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/diff/constants'
import { changeSummary } from '@/diff/records'

const route = useRoute()
const router = useRouter()

const SIZE_OPTIONS = [10, 20, 50, 100]
const MATCHED_VALUES = ['0', '1', '2']
const MATCHED_OPTIONS = [
  { value: 'all', label: '全部匹配态' },
  { value: '1', label: '匹配' },
  { value: '0', label: '不匹配' },
  { value: '2', label: '未知' },
]

// 地址即状态：非法值一律回落缺省，手改地址不会把页面弄坏
const state = computed(() => {
  const rawMatched = String(route.query.matched ?? '')
  const matched = MATCHED_VALUES.includes(rawMatched) ? rawMatched : ''

  const rawPage = Math.floor(Number(route.query.page))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1

  const rawSize = Math.floor(Number(route.query.size))
  const size = SIZE_OPTIONS.includes(rawSize) ? rawSize : DEFAULT_LIMIT

  // 集合只有「不传」与「关注集」两种形态，其它取值一律当成未勾选
  const scope = String(route.query.scope ?? '') === WARN_SCOPE ? WARN_SCOPE : ''

  return { matched, page, size, scope }
})

const loading = ref(false)
const errorMessage = ref('')
const pageData = ref({ total: 0, rows: [], page: 1, size: DEFAULT_LIMIT })

let seq = 0
let controller = null

async function load() {
  const token = (seq += 1)
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  errorMessage.value = ''

  try {
    const payload = await listMatchResults({
      page: state.value.page,
      size: state.value.size,
      matched: state.value.matched,
      scope: state.value.scope,
      signal: controller.signal,
    })
    if (token !== seq) return

    const total = Number(payload?.total) || 0
    const rows = Array.isArray(payload?.rows) ? payload.rows : []
    // 页码越界：总数不为 0 却取不到条目，说明停在了超过总页数的位置，回第一页
    if (total > 0 && rows.length === 0 && state.value.page > 1) {
      router.replace({ query: toListQuery({ ...state.value, page: 1 }) })
      return
    }

    pageData.value = {
      total,
      rows,
      page: state.value.page,
      size: state.value.size,
    }
  } catch (error) {
    if (token !== seq || error.name === 'AbortError') return
    // 失败不能显示成「没有数据」，这里清空列表并交给错误提示
    errorMessage.value = error.message || '加载失败'
    pageData.value = { total: 0, rows: [], page: 1, size: state.value.size }
  } finally {
    if (token === seq) loading.value = false
  }
}

// 集合、过滤条件或分页一变就重新取数；四个值放进一个 watch，不会取两次
watch(
  () => [state.value.scope, state.value.matched, state.value.page, state.value.size],
  load,
  { immediate: true },
)

// 把过滤与分页折叠成地址 query：缺省值不写回，保持地址干净
function toListQuery(next) {
  const query = {}
  if (next.scope === WARN_SCOPE) query.scope = WARN_SCOPE
  if (next.matched) query.matched = String(next.matched)
  if (Number(next.page) > 1) query.page = String(next.page)
  if (Number(next.size) !== DEFAULT_LIMIT) query.size = String(next.size)
  return query
}

// 把冗余或非法的地址参数改写成规范形态，保持可分享
watch(
  () => route.query,
  (query) => {
    const canonical = toListQuery(state.value)

    // 四个键都要参与比对，否则新增的 scope 既纠正不了也保不住
    const same = ['scope', 'matched', 'page', 'size'].every(
      (key) => String(query[key] ?? '') === String(canonical[key] ?? ''),
    )
    if (!same) router.replace({ query: canonical })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  seq += 1
  controller?.abort()
})

function updateQuery(patch) {
  const next = {
    scope: state.value.scope,
    matched: state.value.matched,
    page: state.value.page,
    size: state.value.size,
    ...patch,
  }
  router.push({ query: toListQuery(next) })
}

const matchedOption = computed(() => state.value.matched || 'all')

function onMatchedChange(value) {
  // 切换过滤必须回到第一页，否则会停在一个不存在的页码上
  updateQuery({ matched: value === 'all' ? '' : value, page: 1 })
}

const attentionOnly = computed(() => state.value.scope === WARN_SCOPE)

function onScopeChange(event) {
  // 与切换匹配态同理：集合变了，页码也必须回到第一页
  updateQuery({ scope: event.target.checked ? WARN_SCOPE : '', page: 1 })
}

function onTableChange(pagination) {
  updateQuery({ page: pagination.current, size: pagination.pageSize })
}

const pagination = computed(() => ({
  current: state.value.page,
  pageSize: state.value.size,
  total: pageData.value.total,
  showSizeChanger: true,
  pageSizeOptions: SIZE_OPTIONS.map(String),
  showTotal: (total) => `共 ${total} 条`,
}))

const columns = [
  { title: '编号', key: 'ordinal', width: 72 },
  { title: '发布稿件名', key: 'input', ellipsis: true },
  { title: '内部稿件名', key: 'reference', ellipsis: true },
  { title: '结果', key: 'result', width: 180 },
  { title: '状态', key: 'status', width: 96 },
  { title: '创建时间', key: 'created_at', width: 170 },
  { title: '详情', key: 'actions', width: 88 },
]

const RESULT_COLORS = {
  suspectedUnreviewed: 'warning',
  notCompared: 'default',
  pending: 'default',
  processing: 'processing',
  failed: 'error',
}

// 序号按页码与条数派生，与结论编号无关；行标识仍由 row-key 取 record.id
const rows = computed(() =>
  pageData.value.rows.map((record, index) => ({
    ...record,
    ordinal: (pageData.value.page - 1) * pageData.value.size + index + 1,
    result: changeSummary(record),
  })),
)

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function isEnterable(record) {
  // 只有匹配成功的结论才有可比较的差异明细；零记录的一致结论同样可以进入
  return record.matched === 1
}

// 失败不能长相像「没有数据」：空态文案要区分加载中、取数失败、真的没有三种情况
const emptyDescription = computed(() => {
  if (loading.value) return '正在加载…'
  if (errorMessage.value) return '暂时无法获取数据'
  // 该组合按后端契约恒为空集：说清是「没有交集」，别让人以为没数据
  if (attentionOnly.value && state.value.matched === '2') {
    return '「未知」匹配态下不存在疑似未审或有差异的结论，请切换匹配态'
  }
  return '没有符合条件的结论'
})

function openDetail(record) {
  if (!isEnterable(record)) return
  // 详情地址带上列表当前的过滤与分页，返回列表时才能原样恢复
  router.push({
    name: 'match-result-detail',
    params: { id: record.id },
    query: toListQuery(state.value),
  })
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1>稿件核查结论</h1>
        <p>只读视图：按服务端分页与过滤列出对比结果，点开可查看两侧逐行对照。</p>
      </div>
      <div class="filters">
        <a-checkbox
          :checked="attentionOnly"
          class="scope-filter"
          title="未匹配到内部稿，或匹配成功且存在差异；两侧完全一致与未完成比对不在其中"
          @change="onScopeChange"
        >
          仅看疑似未审或有差异
        </a-checkbox>
        <a-select
          :value="matchedOption"
          :options="MATCHED_OPTIONS"
          class="matched-filter"
          aria-label="匹配态过滤"
          @change="onMatchedChange"
        />
      </div>
    </header>

    <a-alert
      v-if="errorMessage"
      class="load-error"
      type="error"
      show-icon
      :message="`加载失败：${errorMessage}`"
      description="请确认后端服务已启动，然后重试。"
    >
      <template #action>
        <a-button size="small" @click="load">重试</a-button>
      </template>
    </a-alert>

    <a-table
      :columns="columns"
      :data-source="errorMessage ? [] : rows"
      :loading="loading"
      :pagination="pagination"
      :scroll="{ x: 1000 }"
      :row-key="(record) => record.id"
      size="middle"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'ordinal'">
          <span class="mono" :title="`结论 #${record.id}`">{{ record.ordinal }}</span>
        </template>

        <template v-else-if="column.key === 'status'">
          <a-tag :color="STATUS_COLORS[record.status] || 'default'">
            {{ STATUS_LABELS[record.status] || record.status }}
          </a-tag>
        </template>

        <template v-else-if="column.key === 'reference'">
          <span v-if="record.reference && record.reference.title">{{ record.reference.title }}</span>
          <span v-else class="placeholder">（无内部稿件）</span>
        </template>

        <template v-else-if="column.key === 'input'">
          <a
            :href="record.input.business_id"
            target="_blank"
            rel="noopener noreferrer"
            :title="record.input.business_id"
          >
            {{ record.input.title || '（无标题）' }}
          </a>
        </template>

        <template v-else-if="column.key === 'result'">
          <span v-if="record.result.tone === 'same'" class="summary-same">{{ record.result.text }}</span>
          <span v-else-if="record.result.tone === 'counts'" class="summary">
            <span v-if="!record.result.parts.length">{{ record.result.text }}</span>
            <span
              v-for="part in record.result.parts"
              :key="part.kind"
              :class="`summary-${part.kind}`"
              >{{ KIND_LABELS[part.kind] }} {{ part.count }}</span
            >
          </span>
          <a-tooltip v-else :title="record.result.hint">
            <a-tag :color="RESULT_COLORS[record.result.tone] || 'default'">
              {{ record.result.text }}
            </a-tag>
          </a-tooltip>
        </template>

        <template v-else-if="column.key === 'created_at'">
          <span class="time">{{ formatTime(record.created_at) }}</span>
        </template>

        <template v-else-if="column.key === 'actions'">
          <a-button v-if="isEnterable(record)" type="link" size="small" @click="openDetail(record)">
            查看详情
          </a-button>
          <a-tooltip v-else title="只有匹配成功的结论才有可比较的差异明细">
            <span class="disabled-link" aria-disabled="true">查看详情</span>
          </a-tooltip>
        </template>
      </template>

      <template #emptyText>
        <a-empty :description="emptyDescription" />
      </template>
    </a-table>
  </div>
</template>

<style scoped>
.page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-head h1 {
  margin: 0 0 4px;
  font-size: 20px;
}

.page-head p {
  margin: 0;
  color: var(--pm-muted);
}

.matched-filter {
  width: 160px;
}

.filters {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.scope-filter {
  white-space: nowrap;
}

.load-error {
  margin-bottom: 16px;
}

.mono {
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
}

.placeholder,
.disabled-link {
  color: var(--pm-muted);
}

.disabled-link {
  cursor: not-allowed;
}

.time {
  color: var(--pm-muted);
}

.summary {
  display: inline-flex;
  gap: 8px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.summary-added {
  color: #6fdc8c;
}

.summary-removed {
  color: #ff8b8b;
}

.summary-replaced {
  color: #ffd28a;
}

.summary-same {
  color: var(--pm-muted);
}
</style>
