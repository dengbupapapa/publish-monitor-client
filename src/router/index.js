import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/match-results' },
  {
    path: '/match-results',
    name: 'match-results',
    component: () => import('@/views/MatchResultList.vue'),
  },
  {
    path: '/match-results/:id',
    name: 'match-result-detail',
    component: () => import('@/views/MatchResultDetail.vue'),
    props: true,
  },
  // 只读页面没有更好的落点，未知地址一律回列表
  { path: '/:pathMatch(.*)*', redirect: '/match-results' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
