import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import Components from 'unplugin-vue-components/vite'
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'

// 后端服务默认监听 127.0.0.1:8001，且未配置 CORS；开发期统一经 /api 前缀代理过去，
// 前端只拼相对路径，生产环境假定同域反向代理承担同样的转义。
// 用假数据做形态验收时可把 BACKEND_ORIGIN 指向本地 stub，缺省行为不变。
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    // Ant Design Vue 4 走 cssinjs，不产出样式文件，因此 importStyle 关闭，
    // 只需在入口引入一次 reset.css。
    Components({
      resolvers: [AntDesignVueResolver({ importStyle: false })],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
