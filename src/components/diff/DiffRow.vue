<script setup>
import { computed } from 'vue'

const props = defineProps({
  row: { type: Object, required: true },
  refAtoms: { type: Array, required: true },
  inpAtoms: { type: Array, required: true },
  refLabel: { type: String, default: '内部稿件' },
  inpLabel: { type: String, default: '发布稿件' },
})

// 行规格里 -1 表示这一侧在本行没有内容
const refAtom = computed(() => (props.row.reference >= 0 ? props.refAtoms[props.row.reference] : null))
const inpAtom = computed(() => (props.row.input >= 0 ? props.inpAtoms[props.row.input] : null))
</script>

<template>
  <div class="row">
    <div class="cell" data-side="reference" :class="{ 'empty-side': !refAtom }">
      <div v-if="refAtom" class="rendered" v-html="refAtom.html"></div>
      <span v-else class="only-note">{{ refLabel }}无对应内容</span>
    </div>
    <div class="mid"></div>
    <div class="cell" data-side="input" :class="{ 'empty-side': !inpAtom }">
      <div v-if="inpAtom" class="rendered" v-html="inpAtom.html"></div>
      <span v-else class="only-note">{{ inpLabel }}无对应内容</span>
    </div>
  </div>
</template>
