<script setup>
import { theme } from 'ant-design-vue'

// 暗色外壳：列表页与详情页共用一套配色，对照区的语义色也从这里取，
// 避免出现「一半 antd、一半自绘」的两套暗色。
const appTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#4c8ef7',
    borderRadius: 6,
    fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
  },
}
</script>

<template>
  <a-config-provider :theme="appTheme">
    <nav class="app-nav" aria-label="页面导航">
      <RouterLink to="/match-results" class="nav-link">结论列表</RouterLink>
      <RouterLink to="/scheduled-tasks" class="nav-link">定时任务</RouterLink>
    </nav>
    <router-view />
  </a-config-provider>
</template>

<style scoped>
.app-nav {
  display: flex;
  gap: 20px;
  align-items: center;
  max-width: 1440px;
  margin: 0 auto;
  padding: 12px 24px 0;
}

.nav-link {
  color: var(--pm-muted);
  text-decoration: none;
  font-size: 14px;
  padding-bottom: 4px;
  border-bottom: 2px solid transparent;
}

.nav-link.router-link-active {
  color: #4c8ef7;
  border-bottom-color: #4c8ef7;
}
</style>
