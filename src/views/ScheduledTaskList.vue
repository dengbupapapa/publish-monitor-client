<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'

import { isAbort } from '@/api/http'
import {
  createScheduledTask,
  DEFAULT_LIMIT,
  deleteScheduledTask,
  listJobTypes,
  listScheduledTasks,
  setScheduledTaskEnabled,
  updateScheduledTask,
} from '@/api/scheduledTasks'
import { describeCronSafely } from '@/components/cron/cronText'
import ScheduledTaskForm from '@/components/schedule/ScheduledTaskForm.vue'

const route = useRoute()
const router = useRouter()

const SIZE_OPTIONS = [10, 20, 50, 100]

// 地址即状态：非法值一律回落缺省，手改地址不会把页面弄坏
const state = computed(() => {
  const rawPage = Math.floor(Number(route.query.page))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1

  const rawSize = Math.floor(Number(route.query.size))
  const size = SIZE_OPTIONS.includes(rawSize) ? rawSize : DEFAULT_LIMIT

  const jobType = typeof route.query.job_type === 'string' ? route.query.job_type.trim() : ''

  return { page, size, jobType }
})

// 把过滤与分页折叠成地址 query：缺省值不写回，保持地址干净
function toQuery(next) {
  const query = {}
  if (next.jobType) query.job_type = next.jobType
  if (Number(next.page) > 1) query.page = String(next.page)
  if (Number(next.size) !== DEFAULT_LIMIT) query.size = String(next.size)
  return query
}

function updateQuery(patch) {
  router.push({ query: toQuery({ ...state.value, ...patch }) })
}

// 把冗余或非法的地址参数改写成规范形态，保持可分享
watch(
  () => route.query,
  (query) => {
    const canonical = toQuery(state.value)
    const same = ['job_type', 'page', 'size'].every(
      (key) => String(query[key] ?? '') === String(canonical[key] ?? ''),
    )
    if (!same) router.replace({ query: canonical })
  },
  { immediate: true },
)

// ---- 数据加载 ----

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
    const payload = await listScheduledTasks({
      page: state.value.page,
      size: state.value.size,
      jobType: state.value.jobType,
      signal: controller.signal,
    })
    if (token !== seq) return

    // 页码越界：总数不为 0 却取不到条目，回第一页而不是显示空表
    if (payload.total > 0 && payload.rows.length === 0 && state.value.page > 1) {
      router.replace({ query: toQuery({ ...state.value, page: 1 }) })
      return
    }

    pageData.value = {
      total: payload.total,
      rows: payload.rows,
      page: state.value.page,
      size: state.value.size,
    }
  } catch (error) {
    if (token !== seq || isAbort(error)) return
    // 失败不能显示成「没有数据」：清空列表并交给错误提示
    errorMessage.value = error.message || '加载失败'
    pageData.value = { total: 0, rows: [], page: state.value.page, size: state.value.size }
  } finally {
    if (token === seq) loading.value = false
  }
}

watch(() => [state.value.page, state.value.size, state.value.jobType], load, { immediate: true })

onBeforeUnmount(() => {
  seq += 1
  controller?.abort()
})

// ---- 流程类型字典 ----

const jobTypes = ref([])

async function loadJobTypes() {
  try {
    jobTypes.value = await listJobTypes()
  } catch {
    // 字典失败不阻塞列表：展示回退原始标识，新建/编辑时表单会提示无法加载
    jobTypes.value = []
  }
}

onMounted(loadJobTypes)

const jobTypeLabels = computed(() => {
  const map = new Map()
  for (const item of jobTypes.value) {
    if (item && item.value) map.set(item.value, item.label || item.value)
  }
  return map
})

function jobTypeLabel(value) {
  return jobTypeLabels.value.get(value) || value || '—'
}

const jobTypeFilterOptions = computed(() => [
  { value: '', label: '全部' },
  ...jobTypes.value
    .filter((item) => item && item.value)
    .map((item) => ({ value: item.value, label: item.label || item.value })),
])

function onFilterChange(value) {
  updateQuery({ jobType: value || '', page: 1 })
}

async function refresh() {
  await Promise.all([loadJobTypes(), load()])
}

// ---- 表格 ----

const columns = [
  { title: '编号', key: 'ordinal', width: 72 },
  { title: '名称', key: 'name', ellipsis: true },
  { title: '任务类型', key: 'job_type', width: 150, ellipsis: true },
  { title: '账号', key: 'biz_scope', width: 140, ellipsis: true },
  { title: '任务规则', key: 'cron', width: 220, ellipsis: true },
  { title: '启用', key: 'enabled', width: 88 },
  { title: '上次触发', key: 'last_fired_at', width: 180 },
  { title: '操作', key: 'actions', width: 130, fixed: 'right' },
]

// 序号按页码与条数派生，与任务编号无关；行标识仍由 row-key 取 record.id
const rows = computed(() =>
  errorMessage.value
    ? []
    : pageData.value.rows.map((record, index) => {
        const cronDescription = describeCronSafely(record.cron)
        return {
          ...record,
          ordinal: (pageData.value.page - 1) * pageData.value.size + index + 1,
          cronDescription,
          cronTitle:
            cronDescription && cronDescription !== record.cron
              ? `${cronDescription}\n${record.cron}`
              : record.cron || '',
        }
      }),
)

const pagination = computed(() => ({
  current: state.value.page,
  pageSize: state.value.size,
  total: pageData.value.total,
  showSizeChanger: true,
  pageSizeOptions: SIZE_OPTIONS.map(String),
  showTotal: (total) => `共 ${total} 条`,
}))

function onTableChange(paginationState) {
  updateQuery({ page: paginationState.current, size: paginationState.pageSize })
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

// ---- 启停 ----

// 按行维护开关的提交态：请求中禁用，失败回弹
const togglingIds = ref(new Set())
const actionError = ref('')

async function onEnabledChange(record, checked) {
  togglingIds.value = new Set([...togglingIds.value, record.id])
  try {
    await setScheduledTaskEnabled(record.id, checked)
    // 直接改数据源里的原对象：rows 是派生视图，改副本不会持久
    const target = pageData.value.rows.find((item) => item.id === record.id)
    if (target) target.enabled = checked
  } catch (error) {
    actionError.value = `启停失败：${error.message || '请稍后重试'}`
  } finally {
    const next = new Set(togglingIds.value)
    next.delete(record.id)
    togglingIds.value = next
  }
}

// ---- 删除 ----

const deletingIds = ref(new Set())

async function onDelete(record) {
  deletingIds.value = new Set([...deletingIds.value, record.id])
  actionError.value = ''
  try {
    await deleteScheduledTask(record.id)
    await load()
  } catch (error) {
    actionError.value = `删除失败：${error.message || '请稍后重试'}`
  } finally {
    const next = new Set(deletingIds.value)
    next.delete(record.id)
    deletingIds.value = next
  }
}

// ---- 新建 / 编辑共用表单 ----

const editorOpen = ref(false)
const editorMode = ref('create')
const editingTask = ref(null)
const submitting = ref(false)
const formRef = ref(null)

function openCreate() {
  editorMode.value = 'create'
  editingTask.value = null
  editorOpen.value = true
}

function openEdit(record) {
  editorMode.value = 'edit'
  editingTask.value = record
  editorOpen.value = true
}

function onModalOk() {
  formRef.value?.submit()
}

async function onSubmit(payload) {
  submitting.value = true
  const isEdit = editorMode.value === 'edit'
  try {
    if (isEdit) {
      await updateScheduledTask(editingTask.value.id, payload)
    } else {
      await createScheduledTask(payload)
    }
    editorOpen.value = false
    message.success(isEdit ? '保存成功' : '创建成功')
    await load()
  } catch (error) {
    // 服务端校验失败必须保留表单让用户改，并按业务码归位到对应字段
    formRef.value?.applyServerError(error)
  } finally {
    submitting.value = false
  }
}

const emptyDescription = computed(() => {
  if (loading.value) return '正在加载…'
  if (errorMessage.value) return '暂时无法获取数据'
  if (state.value.jobType) return '没有该任务类型的任务'
  return '还没有定时任务，点击「新建任务」创建第一个'
})
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div class="filters">
        <a-select
          :value="state.jobType"
          :options="jobTypeFilterOptions"
          class="type-filter"
          aria-label="按任务类型筛选"
          @change="onFilterChange"
        />
      </div>
      <div class="actions">
        <a-button :loading="loading" @click="refresh">刷新</a-button>
        <a-button type="primary" @click="openCreate">新建任务</a-button>
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

    <a-alert
      v-else-if="actionError"
      class="load-error"
      type="warning"
      show-icon
      :message="actionError"
      closable
      @close="actionError = ''"
    />

    <a-table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="pagination"
      :scroll="{ x: 1200 }"
      :row-key="(record) => record.id"
      size="middle"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'ordinal'">
          <span class="mono" :title="`任务 #${record.id}`">{{ record.ordinal }}</span>
        </template>

        <template v-else-if="column.key === 'name'">
          <span :title="record.name">{{ record.name }}</span>
        </template>

        <template v-else-if="column.key === 'job_type'">
          <span :title="record.job_type">{{ jobTypeLabel(record.job_type) }}</span>
        </template>

        <template v-else-if="column.key === 'biz_scope'">
          <span v-if="record.biz_scope" :title="record.biz_scope">{{ record.biz_scope }}</span>
          <span v-else class="placeholder">—</span>
        </template>

        <template v-else-if="column.key === 'cron'">
          <span v-if="record.cronDescription" :title="record.cronTitle">{{ record.cronDescription }}</span>
          <span v-else class="placeholder">—</span>
        </template>

        <template v-else-if="column.key === 'enabled'">
          <a-switch
            :checked="record.enabled"
            :loading="togglingIds.has(record.id)"
            :disabled="togglingIds.has(record.id)"
            :aria-label="record.enabled ? `停用 ${record.name}` : `启用 ${record.name}`"
            @change="(checked) => onEnabledChange(record, checked)"
          />
        </template>

        <template v-else-if="column.key === 'last_fired_at'">
          <span v-if="record.last_fired_at" class="time">{{ formatTime(record.last_fired_at) }}</span>
          <span v-else class="placeholder">未触发过</span>
        </template>

        <template v-else-if="column.key === 'actions'">
          <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
          <a-popconfirm
            :title="`确认删除「${record.name}」？删除后不可恢复`"
            ok-text="删除"
            cancel-text="取消"
            :ok-button-props="{ danger: true }"
            @confirm="onDelete(record)"
          >
            <a-button
              type="link"
              danger
              size="small"
              :loading="deletingIds.has(record.id)"
              :disabled="deletingIds.has(record.id)"
            >
              删除
            </a-button>
          </a-popconfirm>
        </template>
      </template>

      <template #emptyText>
        <a-empty :description="emptyDescription" />
      </template>
    </a-table>

    <a-modal
      v-model:open="editorOpen"
      :title="editorMode === 'edit' ? '编辑定时任务' : '新建定时任务'"
      :confirm-loading="submitting"
      :mask-closable="!submitting"
      :destroy-on-close="true"
      :ok-text="editorMode === 'edit' ? '保存' : '创建'"
      cancel-text="取消"
      @ok="onModalOk"
    >
      <ScheduledTaskForm
        ref="formRef"
        :mode="editorMode"
        :initial="editingTask"
        :job-types="jobTypes"
        :submitting="submitting"
        @submit="onSubmit"
      />
    </a-modal>
  </div>
</template>

<style scoped>
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filters {
  display: flex;
  align-items: center;
  gap: 12px;
}

.type-filter {
  width: 200px;
}

.actions {
  display: flex;
  gap: 12px;
}

.load-error {
  margin-bottom: 16px;
}

.mono {
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
}

.placeholder,
.time {
  color: var(--pm-muted);
}
</style>
