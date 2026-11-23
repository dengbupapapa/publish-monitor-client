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
    <router-view />
  </a-config-provider>
</template>
