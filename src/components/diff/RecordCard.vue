<script setup>
import { computed } from 'vue'

import { KIND_LABELS, SIDE_LABELS } from '@/diff/constants'

const props = defineProps({
  record: { type: Object, required: true },
  active: { type: Boolean, default: false },
  /** 该记录在当前布局里命中的行数；0 表示哪一行都没落到 */
  rowCount: { type: Number, default: 0 },
  /** 当前展示的是第几行（0 基） */
  shownIndex: { type: Number, default: 0 },
})

defineEmits(['focus'])

const CONTENT_LABELS = { text: '文本', image: '图片', link: '链接' }

const kindLabel = computed(() => KIND_LABELS[props.record.kind] || props.record.kind)

const contentLabel = computed(() => CONTENT_LABELS[props.record.contentType] || '内容')

const anchorText = computed(() => {
  if (!props.rowCount) return ''
  return `第 ${Math.min(props.shownIndex + 1, props.rowCount)}/${props.rowCount} 行`
})

/** 两侧各一句：处数或「空侧」，后面跟摘要。 */
function sideLine(side) {
  const scope = props.record[side]
  const count = scope.empty ? '空侧' : `${scope.count} ${props.record.unit}`
  return { count, text: scope.text }
}
</script>

<template>
  <button
    type="button"
    class="record"
    :class="{ active }"
    :data-rid="record.id"
    @click="$emit('focus')"
  >
    <div class="top">
      <span class="badge" :class="record.kind">{{ kindLabel }}</span>
      <span class="badge">{{ contentLabel }}</span>
      <span v-if="rowCount" class="anchor">{{ anchorText }}</span>
      <span v-else class="badge warn">无可定位</span>
    </div>
    <div class="sides">
      <div v-for="side in ['reference', 'input']" :key="side">
        <b>{{ SIDE_LABELS[side] }}</b>
        {{ sideLine(side).count }}
        <template v-if="sideLine(side).text"> · {{ sideLine(side).text }}</template>
      </div>
    </div>
  </button>
</template>
