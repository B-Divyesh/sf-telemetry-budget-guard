const CACHE = 'telemetry-budget-guard-v5'
const SHELL = ['/', '/demo/', '/privacy/', '/terms/', '/404.html', '/favicon.svg', '/apple-touch-icon.png', '/og-image.webp', '/night-market-telemetry.webp', '/night-market-telemetry-720.webp']
const HTML_ROUTES = ['/', '/demo/', '/privacy/', '/terms/', '/404.html']

async function cacheShell() {
  const cache = await caches.open(CACHE)
  await cache.addAll(SHELL)
  const assetUrls = new Set()
  for (const route of HTML_ROUTES) {
    const response = await cache.match(route)
    const html = response ? await response.text() : ''
    for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) assetUrls.add(match[1])
  }
  await cache.addAll([...assetUrls])
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone()
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)))
    }
    return response
  }).catch(() => caches.match(event.request, { ignoreVary: true }).then((cached) => cached || caches.match('/'))))
})
