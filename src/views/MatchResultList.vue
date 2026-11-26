<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { DEFAULT_LIMIT, KEYWORD_MAX_LENGTH, listMatchResults, listRunBizScopeOptions, listRunJobTypes, normalizeBizScope, normalizeJobType, normalizeKeyword, WARN_SCOPE } from '@/api/matchResults'
import { KIND_LABELS, STATUS_COLORS, STATUS_LABELS } from '@/diff/constants'
import { changeSummary } from '@/diff/records'
import { readAttentionOnly, writeAttentionOnly } from '@/stores/listPrefs'

const route = useRoute()
const router = useRouter()

const SIZE_OPTIONS = [10, 20, 50, 100]
const MATCHED_VALUES = ['0', '1', '2']
const KEYWORD_DEBOUNCE_MS = 300

// 地址即状态：非法值一律回落缺省，手改地址不会把页面弄坏
const state = computed(() => {
  const rawMatched = String(route.query.matched ?? '')
  const matched = MATCHED_VALUES.includes(rawMatched) ? rawMatched : ''

  const rawPage = Math.floor(Number(route.query.page))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1

  const rawSize = Math.floor(Number(route.query.size))
  const size = SIZE_OPTIONS.includes(rawSize) ? rawSize : DEFAULT_LIMIT

  const keyword = normalizeKeyword(route.query.keyword)

  // 关注集三态：null 表示地址没表态（交给缓存兜底），'' 表示地址显式否定，warn 表示勾选
  const rawScope = String(route.query.scope ?? '').trim()
  const explicitScope = rawScope === '' ? null : rawScope === WARN_SCOPE ? WARN_SCOPE : ''

  const jobType = normalizeJobType(route.query.job_type)
  const bizScope = normalizeBizScope(route.query.biz_scope)

  return { matched, page, size, keyword, explicitScope, jobType, bizScope }
})

// 地址没表态时才用本地缓存；缓存只在使用者显式勾选/取消时写入
const cachedAttention = ref(readAttentionOnly())

const attentionOnly = computed(() =>
  state.value.explicitScope === null ? cachedAttention.value : state.value.explicitScope === WARN_SCOPE,
)

const effectiveScope = computed(() => (attentionOnly.value ? WARN_SCOPE : ''))

// 运行维度选项：来自运行记录而非流程注册表，含已下线但仍有结论的历史类型
const ALL_OPTION = { value: '', label: '全部' }
const jobTypes = ref([])
const scopeOptions = ref([])
const scopeCache = new Map()
const scopeInflight = new Map()
let scopeSeq = 0
let disposed = false

function normalizeJobTypeOptions(items) {
  return items
    .map((item) => ({
      value: String(item?.value ?? ''),
      label: String(item?.label || item?.value || ''),
    }))
    .filter((item) => item.value)
}

// 账号的展示名就是筛选值：接口的 value 是业务编号，而 biz_scope 参数比的是名称
function normalizeScopeOptions(items) {
  return items
    .map((item) => {
      const label = String(item?.label || item?.value || '').trim()
      return { value: label, label }
    })
    .filter((item) => item.value)
}

async function loadJobTypes() {
  try {
    const items = await listRunJobTypes()
    if (!disposed) jobTypes.value = normalizeJobTypeOptions(items)
  } catch {
    // 首屏失败保持空列表：下拉只剩「全部」，列表不受影响
  }
}

loadJobTypes()
// 按任务类型取账号选项；失败返回 null 表示「结果未知」，调用方不应据此清空已选账号
async function ensureBizScopes(jobType) {
  const key = jobType || ''
  if (scopeCache.has(key)) {
    scopeOptions.value = scopeCache.get(key)
    return scopeCache.get(key)
  }
  if (scopeInflight.has(key)) return scopeInflight.get(key)

  const token = (scopeSeq += 1)
  const request = listRunBizScopeOptions(key)
    .then((items) => {
      const options = normalizeScopeOptions(items)
      if (disposed) return options
      scopeCache.set(key, options)
      // 只让最新一次请求覆盖下拉，慢响应不能把新类型的选项顶掉
      if (token === scopeSeq) scopeOptions.value = options
      return options
    })
    .catch(() => null)
    .finally(() => scopeInflight.delete(key))

  scopeInflight.set(key, request)
  return request
}

const jobTypeOptions = computed(() => {
  const base = [{ ...ALL_OPTION }, ...jobTypes.value]
  const current = state.value.jobType
  // 地址里有、接口没返回（历史类型或接口失败）也要能回显，不能被吞掉
  if (current && !base.some((option) => option.value === current)) {
    base.push({ value: current, label: current })
  }
  return base
})

const bizScopeOptions = computed(() => {
  const base = [{ ...ALL_OPTION }, ...scopeOptions.value]
  const current = state.value.bizScope
  if (current && !base.some((option) => option.value === current)) {
    base.push({ value: current, label: current })
  }
  return base
})

// 直开、后退、前进与切换类型都走这里刷新账号选项
watch(
  () => state.value.jobType,
  (jobType) => {
    ensureBizScopes(jobType)
  },
  { immediate: true },
)

let cascadeSeq = 0
const cascadePending = ref(false)

// 切换任务类型：先写地址让下拉立刻反映，再等新账号选项决定是否清空失效账号，最后才取列表
async function onJobTypeChange(value) {
  const nextType = normalizeJobType(value)
  if (nextType === state.value.jobType) return

  const token = (cascadeSeq += 1)
  cascadePending.value = true
  try {
    const scopes = ensureBizScopes(nextType)
    await router.push({ query: toListQuery({ ...explicitState.value, jobType: nextType, page: 1 }) })
    const options = await scopes
    if (token !== cascadeSeq || disposed) return

    const current = state.value.bizScope
    if (options && current && !options.some((option) => option.value === current)) {
      await router.replace({ query: toListQuery({ ...explicitState.value, bizScope: '', page: 1 }) })
    }
  } finally {
    if (token === cascadeSeq) {
      cascadePending.value = false
      if (!disposed) load()
    }
  }
}

function onBizScopeChange(value) {
  updateQuery({ bizScope: normalizeBizScope(value), page: 1 })
}

// 写回地址只用地址自己的取值：缓存回填不应把偏好写进地址
const explicitState = computed(() => ({
  scope: state.value.explicitScope ?? '',
  matched: state.value.matched,
  keyword: state.value.keyword,
  jobType: state.value.jobType,
  bizScope: state.value.bizScope,
  page: state.value.page,
  size: state.value.size,
}))

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
      keyword: state.value.keyword,
      scope: effectiveScope.value,
      jobType: state.value.jobType,
      bizScope: state.value.bizScope,
      signal: controller.signal,
    })
    if (token !== seq) return

    const total = Number(payload?.total) || 0
    const rows = Array.isArray(payload?.rows) ? payload.rows : []
    // 页码越界：总数不为 0 却取不到条目，说明停在了超过总页数的位置，回第一页
    if (total > 0 && rows.length === 0 && state.value.page > 1) {
      router.replace({ query: toListQuery({ ...explicitState.value, page: 1 }) })
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

// 集合、关键词、运行维度、匹配态或分页一变就重新取数；七个值放进一个 watch，不会取两次
watch(
  () => [
    attentionOnly.value,
    state.value.matched,
    state.value.keyword,
    state.value.jobType,
    state.value.bizScope,
    state.value.page,
    state.value.size,
  ],
  () => {
    // 级联未落定前不取数，避免先按旧账号请求一次
    if (cascadePending.value) return
    load()
  },
  { immediate: true },
)

// 把过滤与分页折叠成地址 query：缺省值不写回，保持地址干净
function toListQuery(next) {
  const query = {}
  if (next.scope === WARN_SCOPE) query.scope = WARN_SCOPE
  if (next.matched) query.matched = String(next.matched)
  if (next.keyword) query.keyword = next.keyword
  if (next.jobType) query.job_type = next.jobType
  if (next.bizScope) query.biz_scope = next.bizScope
  if (Number(next.page) > 1) query.page = String(next.page)
  if (Number(next.size) !== DEFAULT_LIMIT) query.size = String(next.size)
  return query
}

// 把冗余或非法的地址参数改写成规范形态，保持可分享
watch(
  () => route.query,
  (query) => {
    const canonical = toListQuery(explicitState.value)

    // 七个键都要参与比对，否则新增的键既纠正不了也保不住
    const same = ['scope', 'matched', 'keyword', 'job_type', 'biz_scope', 'page', 'size'].every(
      (key) => String(query[key] ?? '') === String(canonical[key] ?? ''),
    )
    if (!same) router.replace({ query: canonical })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearKeywordTimer()
  disposed = true
  cascadeSeq += 1
  scopeSeq += 1
  seq += 1
  controller?.abort()
})

function updateQuery(patch) {
  router.push({ query: toListQuery({ ...explicitState.value, ...patch }) })
}

function onScopeChange(event) {
  const checked = Boolean(event.target.checked)
  // 缓存只在这里写：加载或地址恢复都不回写，否则分享链接会改掉本地偏好
  cachedAttention.value = checked
  writeAttentionOnly(checked)
  // 集合变了，页码也必须回到第一页
  updateQuery({ scope: checked ? WARN_SCOPE : '', page: 1 })
}

// 输入框持输入态（允许有尾部空白），地址持归一态；两者只在值不同时互相推动
const keywordInput = ref(state.value.keyword)
let keywordTimer = null

function clearKeywordTimer() {
  if (keywordTimer === null) return
  clearTimeout(keywordTimer)
  keywordTimer = null
}

function commitKeyword() {
  clearKeywordTimer()
  const term = normalizeKeyword(keywordInput.value)
  // 地址已经是这个值（回灌或重复提交）：不再写一次，否则会把后退结果改回去
  if (term === state.value.keyword) return
  router.replace({ query: toListQuery({ ...explicitState.value, keyword: term, page: 1 }) })
}

function onKeywordValue(value) {
  keywordInput.value = typeof value === 'string' ? value : ''
  clearKeywordTimer()
  keywordTimer = setTimeout(commitKeyword, KEYWORD_DEBOUNCE_MS)
}

// 地址是关键词语义的真相：后退、前进、直开时把输入框拉回地址里的值
watch(
  () => state.value.keyword,
  (keyword) => {
    if (normalizeKeyword(keywordInput.value) === keyword) return
    clearKeywordTimer()
    keywordInput.value = keyword
  },
)

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

// 失败不能长成「没有数据」：空态文案要区分加载中、取数失败、组合恒空、关键词无命中与真的没有
const emptyDescription = computed(() => {
  if (loading.value) return '正在加载…'
  if (errorMessage.value) return '暂时无法获取数据'
  // 该组合按后端契约恒为空集：说清是「没有交集」，别让人以为没数据
  if (attentionOnly.value && state.value.matched === '2') {
    return '「未知」匹配态下不存在疑似未审或有差异的结论'
  }
  // 关键词是使用者自己能改的条件，必须与「真的没有数据」区分开
  if (state.value.keyword) {
    return `没有标题命中「${state.value.keyword}」的结论，可改写或清空关键词`
  }
  // 运行维度是使用者能改选的组合，同样需要单独说明；文案用下拉展示名而不是原始标识
  if (state.value.jobType || state.value.bizScope) {
    const conditions = []
    if (state.value.jobType) {
      const label = jobTypeOptions.value.find((option) => option.value === state.value.jobType)?.label
      conditions.push(`任务类型「${label || state.value.jobType}」`)
    }
    if (state.value.bizScope) {
      conditions.push(`账号「${state.value.bizScope}」`)
    }
    return `${conditions.join(' + ')} 条件下没有结论，可改选或恢复为「全部」`
  }
  return '没有符合条件的结论'
})

function openDetail(record) {
  if (!isEnterable(record)) return
  // 详情地址带上列表当前的过滤与分页，返回列表时才能原样恢复；
  // 关注集取生效值，因为详情要恢复的是使用者看到的视图
  router.push({
    name: 'match-result-detail',
    params: { id: record.id },
    query: toListQuery({ ...explicitState.value, scope: effectiveScope.value }),
  })
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div class="filters">
        <a-select
          :value="state.jobType"
          class="dimension-filter"
          :options="jobTypeOptions"
          aria-label="任务类型"
          @change="onJobTypeChange"
        />
        <a-select
          :value="state.bizScope"
          class="dimension-filter"
          :options="bizScopeOptions"
          aria-label="账号"
          @change="onBizScopeChange"
        />
        <a-input-search
          :value="keywordInput"
          class="keyword-filter"
          placeholder="按稿件名检索"
          aria-label="关键词检索"
          allow-clear
          :maxlength="KEYWORD_MAX_LENGTH"
          @update:value="onKeywordValue"
          @search="commitKeyword"
        />
        <a-checkbox
          :checked="attentionOnly"
          class="scope-filter"
          title="未匹配到内部稿，或匹配成功且存在差异；两侧完全一致与未完成比对不在其中"
          @change="onScopeChange"
        >
          仅看疑似未审或有差异
        </a-checkbox>
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
  justify-content: flex-end;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.keyword-filter {
  width: 240px;
}

.dimension-filter {
  width: 180px;
}

.filters {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  flex-wrap: wrap;
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
