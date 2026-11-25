<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'

import { buildSchedulePayload, classifyScheduleError, normalizeName, validateForm } from '@/api/scheduledTasks'
import CronInput from '@/components/cron/CronInput.vue'

const props = defineProps({
  mode: { type: String, default: 'create' }, // 'create' | 'edit'
  initial: { type: Object, default: null },
  jobTypes: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['submit'])

// 只承载界面暴露的字段：biz_name / params 不出现，编辑时也就不发送
const form = reactive({
  name: '',
  job_type: '',
  cron: '',
  biz_scope: '',
  biz_type: '',
})

const errors = reactive({ name: '', job_type: '', cron: '' })
const formError = ref('')

const jobTypeOptions = computed(() =>
  props.jobTypes.map((item) => ({ value: item.value, label: item.label || item.value })),
)

const noJobTypes = computed(() => props.jobTypes.length === 0)

function initFromProps() {
  if (props.mode === 'edit' && props.initial) {
    form.name = props.initial.name || ''
    form.job_type = props.initial.job_type || ''
    form.cron = props.initial.cron || ''
    form.biz_scope = props.initial.biz_scope || ''
    form.biz_type = props.initial.biz_type || ''
    return
  }
  form.name = ''
  form.cron = ''
  form.biz_scope = ''
  form.biz_type = ''
  form.job_type = props.jobTypes[0]?.value || ''
}

onMounted(initFromProps)

// 字典接口可能晚于组件挂载返回：创建态若还没选中类型，补上第一个可选项
watch(
  () => props.jobTypes,
  (list) => {
    if (props.mode === 'create' && !form.job_type && list.length) {
      form.job_type = list[0].value
    }
  },
)

// 字段一改就清掉旧错误：不能让使用者修好了还一直看着红字
watch(
  () => [form.name, form.job_type, form.cron],
  () => {
    errors.name = ''
    errors.job_type = ''
    errors.cron = ''
    formError.value = ''
  },
)

function submit() {
  const result = validateForm(form)
  errors.name = result.name || ''
  errors.job_type = result.job_type || ''
  errors.cron = result.cron || ''
  formError.value = ''
  if (Object.keys(result).length > 0) return

  emit('submit', buildSchedulePayload(form))
}

/**
 * 把服务端失败按业务码归位到字段或表单级。
 *
 * @param {{code?:number|string, status?:number, message?:string}} error
 */
function applyServerError(error) {
  const { field, message } = classifyScheduleError(error)
  errors.name = ''
  errors.job_type = ''
  errors.cron = ''
  formError.value = ''
  if (field === 'name') errors.name = message
  else if (field === 'job_type') errors.job_type = message
  else if (field === 'cron') errors.cron = message
  else formError.value = message
}

defineExpose({ submit, applyServerError })
</script>

<template>
  <a-form layout="vertical" @submit.prevent>
    <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

    <a-form-item
      label="名称"
      required
      :validate-status="errors.name ? 'error' : ''"
      :help="errors.name"
    >
      <a-input
        v-model:value="form.name"
        :maxlength="255"
        :disabled="submitting"
        placeholder="任务名称，全局唯一"
        @blur="form.name = normalizeName(form.name)"
      />
    </a-form-item>

    <a-form-item
      label="任务类型"
      required
      :validate-status="errors.job_type ? 'error' : ''"
      :help="errors.job_type || (noJobTypes ? '任务类型加载失败，请刷新重试' : '')"
    >
      <a-select
        v-model:value="form.job_type"
        :options="jobTypeOptions"
        :disabled="submitting || noJobTypes"
        placeholder="请选择任务类型"
      />
    </a-form-item>

    <div class="scope-row">
      <a-form-item label="平台">
        <a-input
          v-model:value="form.biz_scope"
          :maxlength="128"
          :disabled="submitting"
          placeholder="如：微信公众号（可留空）"
        />
      </a-form-item>

      <a-form-item label="账号">
        <a-input
          v-model:value="form.biz_type"
          :maxlength="128"
          :disabled="submitting"
          placeholder="账号标识（可留空）"
        />
      </a-form-item>
    </div>

    <a-form-item
      label="cron 表达式"
      required
      :validate-status="errors.cron ? 'error' : ''"
      :help="errors.cron"
    >
      <CronInput v-model="form.cron" :disabled="submitting" />
    </a-form-item>
  </a-form>
</template>

<style scoped>
.form-error {
  margin: 0 0 12px;
  color: #ff8b8b;
  font-size: 12px;
}

.scope-row {
  display: flex;
  gap: 12px;
}

.scope-row > * {
  flex: 1;
  min-width: 0;
}
</style>
