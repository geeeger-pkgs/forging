// ============================================================
// Forging Service Worker（v1.9）
// 策略：应用外壳运行时缓存（stale-while-revalidate）
//      导航请求：网络优先，离线回退到缓存的 index.html
// 版本：缓存名取自注册 URL 的 ?v=（每次构建变化）→ 新版本自动清旧缓存
// ============================================================
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
const CACHE = `forging-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      // 首次访问即预缓存外壳与入口资源（解析 index.html 中的 /assets/*）
      const cache = await caches.open(CACHE)
      try {
        const res = await fetch('index.html', { cache: 'no-cache' })
        if (res.ok) {
          await cache.put('index.html', res.clone())
          const html = await res.text()
          const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
          await Promise.all(
            assets.map((u) =>
              fetch(u)
                .then((r) => (r.ok ? cache.put(u, r.clone()) : undefined))
                .catch(() => undefined),
            ),
          )
        }
      } catch {
        /* 安装时离线：由运行时缓存兜底 */
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy))
          return res
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
