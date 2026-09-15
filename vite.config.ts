import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json' with { type: 'json' }

/** 每次构建的版本号（用于 SW 缓存名 + 设置页展示） */
const appVersion = `${pkg.version}+${Date.now().toString(36)}`

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
