const CACHE = 'telemetry-budget-guard-v3'
const SHELL = ['/', '/demo/', '/privacy/', '/terms/', '/404.html', '/favicon.svg', '/apple-touch-icon.png', '/og-image.webp', '/night-market-telemetry.webp', '/night-market-telemetry-720.webp']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
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
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))))
})
