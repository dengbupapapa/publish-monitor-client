<script setup>
import { computed, ref, watch } from 'vue'
import { CronLight } from '@vue-js-cron/light'
import '@vue-js-cron/light/dist/light.css'

import { isValidCron } from '@/api/scheduledTasks'
import { describeCron, formatRunTime, nextRunTimes, PREVIEW_COUNT } from './cronText'

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

function onInput(value) {
  emit('update:modelValue', typeof value === 'string' ? value : '')
}

// 点选器产出的一定是它自己拼装的表达式，直接回传给表单
function onPickerInput(value) {
  if (typeof value === 'string') emit('update:modelValue', value)
}

// 点选器对当前值的解析错误事件：其文案为英文且与本地 isValidCron 判定同源，
// 不直接展示，统一由下方中文校验文案承担（任务 3.2 的评估结论）

// 点选器按 period 决定哪些字段可见；键入的表达式若含当前 period 看不到的字段
// （如"每天"周期下键入星期区间）会被解析丢弃。检测到日/月/周字段时切到"每年"
// （唯一全字段可见的周期）再交给点选器解析，避免联动时静默改写用户表达式
const pickerPeriod = ref('year')
watch(
  () => props.modelValue,
  (value) => {
    const expr = String(value || '').trim()
    if (!isValidCron(expr)) return
    const parts = expr.split(/\s+/)
    const [, hour, dom, mon, dow] = parts
    if (dom !== '*' || mon !== '*' || dow !== '*') {
      if (pickerPeriod.value !== 'year') pickerPeriod.value = 'year'
    } else if (hour !== '*' && pickerPeriod.value === 'minute') {
      pickerPeriod.value = 'hour'
    }
  },
)

const expression = computed(() => String(props.modelValue || '').trim())
const valid = computed(() => isValidCron(expression.value))

// 空值是「还没输入」，只给提示不算错；输入了但解析不了才算校验失败
const errorMessage = computed(() => {
  if (!expression.value || valid.value) return ''
  return '请输入合法的五段式 cron 表达式（分 时 日 月 周）'
})

// 解析失败时预览依赖会抛错，用计算属性前置条件短路
const description = computed(() => (valid.value ? describeCron(expression.value) : ''))
const upcoming = computed(() =>
  valid.value ? nextRunTimes(expression.value, { count: PREVIEW_COUNT }) : [],
)
</script>

<template>
  <div class="cron-input">
    <a-input
      :value="modelValue"
      :disabled="disabled"
      placeholder="如 */5 * * * *（分 时 日 月 周）"
      aria-label="cron 表达式"
      class="cron-field"
      @update:value="onInput"
    />

    <!-- dark 祖先 + theme="ant" 命中库内置的 .dark .ant 主题（下拉菜单白底问题） -->
    <div class="cron-picker-theme dark">
      <CronLight
        class="cron-picker"
        :model-value="modelValue"
        :period="pickerPeriod"
        :disabled="disabled"
        theme="ant"
        locale="zh"
        @update:model-value="onPickerInput"
        @update:period="pickerPeriod = $event"
      />
    </div>

    <div v-if="errorMessage" class="hint hint-error">{{ errorMessage }}</div>

    <div v-else-if="valid" class="preview">
      <p class="hint">{{ description }}</p>
      <p class="hint">
        接下来执行：
        <span v-for="time in upcoming" :key="time.getTime()" class="run-time">
          {{ formatRunTime(time) }}
        </span>
      </p>
      <p class="hint hint-muted">预览仅供参考，以服务端实际触发为准</p>
    </div>

    <div v-else class="hint hint-muted">五段式 cron：分钟 小时 日 月 星期</div>
  </div>
</template>

<style scoped>
.cron-input {
  width: 100%;
}

.cron-field {
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
}

/* CronLight 的 ant 主题靠 --cl-* 变量取色，对齐项目暗色 token（闸门二） */
.cron-picker {
  margin-top: 8px;
  --cl-text-color: var(--pm-text);
  --cl-bg-color: var(--pm-panel-2);
  --cl-border: 1px solid var(--pm-line);
  --cl-btn-hover-border: 1px solid var(--pm-accent);
  --cl-hover-bg-color: var(--pm-line);
  --cl-hover-text-color: var(--pm-text);
  --cl-disabled-bg-color: var(--pm-line);
  --cl-disabled-text-color: var(--pm-muted);
  --cl-selected-bg-color: var(--pm-accent);
  --cl-selected-text-color: #fff;
}

.hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.hint-error {
  color: #ff8b8b;
}

.hint-muted {
  color: var(--pm-muted);
}

.preview {
  margin: 0;
}

.run-time {
  margin-right: 8px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
