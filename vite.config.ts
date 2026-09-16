import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import pkg from './package.json' with { type: 'json' }

/** 每次构建的版本号（用于 SW 缓存名 + 设置页展示） */
const appVersion = `${pkg.version}+${Date.now().toString(36)}`

export default defineConfig({
  /*
   * 部署 base：
   * - 本地 / 根路径部署（自建服务器、Cloudflare Pages、Vercel 等）→ 默认 '/'
   * - GitHub Pages **项目页**（https://<user>.github.io/<repo>/）→ 构建时传 VITE_BASE=/<repo>/
   *   CI 已在 .github/workflows/deploy.yml 按仓库名自动计算；手动部署见 README
   */
  base: process.env.VITE_BASE || '/',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
