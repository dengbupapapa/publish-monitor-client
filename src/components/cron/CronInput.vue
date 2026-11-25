<script setup>
import { computed } from 'vue'
import { CronLight } from '@vue-js-cron/light'
import '@vue-js-cron/light/dist/light.css'

import { isValidCron } from '@/api/scheduledTasks'
import { describeCron, formatRunTime, nextRunTimes, PREVIEW_COUNT } from './cronText'

const props = defineProps({
  modelValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

// 点选器是唯一入口：它产出的一定是自己拼装的表达式，直接回传给表单
function onPickerInput(value) {
  if (typeof value === 'string') emit('update:modelValue', value)
}

const expression = computed(() => String(props.modelValue || '').trim())
const valid = computed(() => isValidCron(expression.value))

// 空值是「还没选择」，只给提示不算错；有值但解析不了才算校验失败
const errorMessage = computed(() => {
  if (!expression.value || valid.value) return ''
  return '请通过点选器生成合法的任务规则（五段式：分 时 日 月 周）'
})

// 解析失败时预览依赖会抛错，用计算属性前置条件短路
const description = computed(() => (valid.value ? describeCron(expression.value) : ''))
const upcoming = computed(() =>
  valid.value ? nextRunTimes(expression.value, { count: PREVIEW_COUNT }) : [],
)
</script>

<template>
  <div class="cron-input">
    <!-- dark 祖先 + theme="ant" 命中库内置的 .dark .ant 主题（下拉菜单白底问题） -->
    <div class="cron-picker-theme dark">
      <CronLight
        class="cron-picker"
        :model-value="modelValue"
        :disabled="disabled"
        theme="ant"
        locale="zh"
        @update:model-value="onPickerInput"
      />
    </div>

    <p class="expression">
      <span class="expression-label">表达式</span>
      <span v-if="expression" class="expression-value">{{ expression }}</span>
      <span v-else class="expression-empty">尚未生成</span>
    </p>

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

/* CronLight 的 ant 主题靠 --cl-* 变量取色，对齐项目暗色 token（闸门二） */
.cron-picker {
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

.expression {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.expression-label {
  color: var(--pm-muted);
  flex: none;
}

.expression-value {
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
  color: var(--pm-text);
  overflow-wrap: anywhere;
}

.expression-empty {
  color: var(--pm-muted);
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
