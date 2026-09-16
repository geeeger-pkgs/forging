import { createApp } from 'vue'
import App from './App.vue'
import { boot, startLoop } from './app/store'
import './ui/styles/theme.css'

boot()
startLoop()
createApp(App).mount('#app')

// PWA：生产构建注册 Service Worker（离线可用 / 可安装）
// 版本号随每次构建变化 → 新 SW 自动接管并清理旧缓存（v1.9）
// v3.7.13：注册路径走 BASE_URL（支持 GitHub Pages 子路径部署 /<repo>/）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(__APP_VERSION__)}`)
      .catch((e) => console.warn('[forging] SW 注册失败', e))
  })
}
