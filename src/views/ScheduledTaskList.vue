<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import {
  createScheduledTask,
  deleteScheduledTask,
  listScheduledTasks,
  normalizeName,
  setScheduledTaskEnabled,
  validateForm,
} from '@/api/scheduledTasks'
import CronInput from '@/components/cron/CronInput.vue'

// 无分页无筛选：全量列表用本地 ref 即可，地址栏留给结论列表的分享场景
const loading = ref(false)
const errorMessage = ref('')
const tasks = ref([])

let seq = 0
let controller = null

async function load() {
  const token = (seq += 1)
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  errorMessage.value = ''

  try {
    const rows = await listScheduledTasks({ signal: controller.signal })
    if (token !== seq) return
    tasks.value = Array.isArray(rows) ? rows : []
  } catch (error) {
    if (token !== seq || error.name === 'AbortError') return
    // 失败不能显示成「没有数据」：清空列表并交给错误提示
    errorMessage.value = error.message || '加载失败'
    tasks.value = []
  } finally {
    if (token === seq) loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  seq += 1
  controller?.abort()
})

const columns = [
  { title: '编号', key: 'ordinal', width: 72 },
  { title: '名称', key: 'name', ellipsis: true },
  { title: 'cron 表达式', key: 'cron', ellipsis: true },
  { title: '启用', key: 'enabled', width: 96 },
  { title: '上次触发', key: 'last_fired_at', width: 190 },
  { title: '操作', key: 'actions', width: 120 },
]

// 序号是展示用的行号；行标识仍由 row-key 取 record.id
const rows = computed(() =>
  tasks.value.map((record, index) => ({ ...record, ordinal: index + 1 })),
)

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatCron(record) {
  return `${record.cron}${record.enabled ? '' : '（已停用）'}`
}

// ---- 启停 ----

// 按行维护开关的提交态：请求中禁用，失败回弹
const togglingIds = ref(new Set())

async function onEnabledChange(record, checked) {
  togglingIds.value = new Set([...togglingIds.value, record.id])
  try {
    await setScheduledTaskEnabled(record.id, checked)
    record.enabled = checked
  } catch (error) {
    // 开关绑定的值没动过，无需回弹；只需说清失败
    actionError.value = `启停失败：${error.message || '请稍后重试'}`
  } finally {
    const next = new Set(togglingIds.value)
    next.delete(record.id)
    togglingIds.value = next
  }
}

// ---- 删除 ----

const deletingIds = ref(new Set())
const actionError = ref('')

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

// ---- 创建 ----

const creating = ref(false)
const submitting = ref(false)
const form = reactive({ name: '', cron: '' })
const formErrors = reactive({ name: '', cron: '' })
const formError = ref('')

function openCreate() {
  form.name = ''
  form.cron = ''
  formErrors.name = ''
  formErrors.cron = ''
  formError.value = ''
  creating.value = true
}

function closeCreate() {
  creating.value = false
}

function resetServerError() {
  formErrors.name = ''
  formErrors.cron = ''
  formError.value = ''
}

function validateFields() {
  const errors = validateForm(form)
  formErrors.name = errors.name || ''
  formErrors.cron = errors.cron || ''
  return Object.keys(errors).length === 0
}

// 字段一改就清掉旧错误：不能让使用者修好了还一直看着红字
watch(
  () => [form.name, form.cron],
  () => {
    formErrors.name = ''
    formErrors.cron = ''
    formError.value = ''
  },
)

async function submitCreate() {
  if (!validateFields()) return

  submitting.value = true
  resetServerError()
  try {
    await createScheduledTask({ name: form.name, cron: form.cron })
    closeCreate()
    await load()
  } catch (error) {
    // 服务端契约：重名 → HTTP 409（业务码 409xx）；参数校验失败 → HTTP 422。
    // 校验失败必须保留表单让用户改，不能弹窗一关了之。
    if (error.status === 409 || String(error.code).startsWith('409')) {
      formErrors.name = error.message || '任务名称已存在'
    } else if (error.status === 422) {
      formErrors.cron = error.message || '服务端校验失败，请检查表达式'
    } else {
      formError.value = `创建失败：${error.message || '请稍后重试'}`
    }
  } finally {
    submitting.value = false
  }
}

const emptyDescription = computed(() => {
  if (loading.value) return '正在加载…'
  if (errorMessage.value) return '暂时无法获取数据'
  return '还没有定时任务，点击「新建任务」创建第一个'
})
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div class="actions">
        <a-button :loading="loading" @click="load">刷新</a-button>
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
      :data-source="errorMessage ? [] : rows"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: 820 }"
      :row-key="(record) => record.id"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'ordinal'">
          <span class="mono" :title="`任务 #${record.id}`">{{ record.ordinal }}</span>
        </template>

        <template v-else-if="column.key === 'name'">
          <span :title="record.name">{{ record.name }}</span>
        </template>

        <template v-else-if="column.key === 'cron'">
          <span class="mono" :title="formatCron(record)">{{ record.cron }}</span>
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
      v-model:open="creating"
      title="新建定时任务"
      :confirm-loading="submitting"
      :mask-closable="!submitting"
      ok-text="创建"
      cancel-text="取消"
      @ok="submitCreate"
    >
      <a-form layout="vertical" @submit.prevent>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <a-form-item
          label="名称"
          required
          :validate-status="formErrors.name ? 'error' : ''"
          :help="formErrors.name"
        >
          <a-input
            v-model:value="form.name"
            :maxlength="255"
            placeholder="任务名称，全局唯一"
            @blur="form.name = normalizeName(form.name)"
          />
        </a-form-item>

        <a-form-item
          label="cron 表达式"
          required
          :validate-status="formErrors.cron ? 'error' : ''"
          :help="formErrors.cron"
        >
          <CronInput v-model="form.cron" :disabled="submitting" />
        </a-form-item>
      </a-form>
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
  justify-content: flex-end;
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 12px;
}

.load-error {
  margin-bottom: 16px;
}

.form-error {
  margin: 0 0 12px;
  color: #ff8b8b;
  font-size: 12px;
}

.mono {
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
}

.placeholder,
.time {
  color: var(--pm-muted);
}
</style>
