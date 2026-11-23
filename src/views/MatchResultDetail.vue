<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getMatchResultPreview } from '@/api/matchResults'
import DiffWorkspace from '@/components/diff/DiffWorkspace.vue'
import { buildRecordViews, collectSpans } from '@/diff/records'
import { renderSide } from '@/diff/render'
import { alignmentEntries, planLayout } from '@/diff/rows'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()

const loading = ref(true)
const notFound = ref(false)
const errorMessage = ref('')
const payload = ref(null)

let seq = 0
let controller = null

async function load() {
  const token = (seq += 1)
  controller?.abort()
  controller = new AbortController()

  loading.value = true
  notFound.value = false
  errorMessage.value = ''
  payload.value = null

  try {
    payload.value = await getMatchResultPreview(props.id, { signal: controller.signal })
  } catch (error) {
    if (token !== seq || error.name === 'AbortError') return
    // 404 表示这条结论没有可渲染的差异明细，和请求失败要分开呈现
    if (error.name === 'NotFoundError') notFound.value = true
    else errorMessage.value = error.message || '加载失败'
  } finally {
    if (token === seq) loading.value = false
  }
}

watch(() => props.id, load, { immediate: true })

onBeforeUnmount(() => {
  seq += 1
  controller?.abort()
})

/**
 * 桥接：五键落库结构 → 对照区契约。
 *
 * 记录视图、两侧原子、行规格都在这里一次算完，模板只负责摆放。
 */
const view = computed(() => {
  if (!payload.value) return null

  const data = payload.value
  const article = data.article || {}
  const bodies = { reference: article.reference_body || '', input: article.input_body || '' }

  const records = buildRecordViews(data.records, data.ranges, bodies)
  const sides = {
    reference: renderSide(bodies.reference, collectSpans(records, 'reference')),
    input: renderSide(bodies.input, collectSpans(records, 'input')),
  }

  const layout = planLayout({
    refBlocks: sides.reference.atoms,
    inpBlocks: sides.input.atoms,
    refOk: sides.reference.blocksOk,
    inpOk: sides.input.blocksOk,
    alignment: alignmentEntries(data.alignment),
  })

  return { article, records, sides, rows: layout.rows, reason: layout.reason }
})

function backToList() {
  // 详情地址带着列表的来源 query，回去时原样带回，否则会丢掉过滤与页码
  router.push({ name: 'match-results', query: route.query })
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-head">
      <a-button type="link" size="small" @click="backToList">← 返回列表</a-button>
      <span class="detail-title">结论 #{{ id }}</span>
      <span v-if="view?.article.coordinate_version" class="detail-meta">
        坐标版本 v{{ view.article.coordinate_version }}
      </span>
    </header>

    <div class="detail-body">
      <div v-if="loading" class="state">
        <a-spin size="large" tip="正在加载对照…">
          <div class="spin-holder"></div>
        </a-spin>
      </div>

      <a-result
        v-else-if="notFound"
        class="state"
        status="warning"
        title="这条结论不可渲染"
        sub-title="只有匹配成功且带差异明细的结论才能查看对照。"
      >
        <template #extra>
          <a-button type="primary" @click="backToList">返回列表</a-button>
        </template>
      </a-result>

      <a-result
        v-else-if="errorMessage"
        class="state"
        status="error"
        title="加载失败"
        :sub-title="errorMessage"
      >
        <template #extra>
          <a-button type="primary" @click="load">重试</a-button>
          <a-button @click="backToList">返回列表</a-button>
        </template>
      </a-result>

      <DiffWorkspace
        v-else-if="view"
        :article="view.article"
        :records="view.records"
        :sides="view.sides"
        :rows="view.rows"
        :reason="view.reason"
      />
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--pm-line);
  background: var(--pm-panel);
}

.detail-title {
  font-weight: 600;
}

.detail-meta {
  color: var(--pm-muted);
  font-size: 12px;
}

.detail-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.state {
  margin: auto;
  padding: 24px;
}

.spin-holder {
  width: 160px;
  height: 120px;
}
</style>
