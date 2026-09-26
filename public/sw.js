// Offline support: the whole app runs in the browser, so caching the page and its
// build files is enough. Pages load from the network first (so a new deploy shows up
// straight away) and fall back to the cache offline; hashed build files never change,
// so they're served from the cache.
const CACHE = 'bto-v2'
const STATIC = ['/', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(STATIC)
    // Also cache the scripts and styles the page uses, so it works offline after one visit.
    const html = await (await cache.match('/')).text()
    const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) ?? [])]
    await cache.addAll(assets)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (res.ok) (await caches.open(CACHE)).put('/', res.clone())
        return res
      } catch {
        return (await caches.match('/', { ignoreVary: true })) ?? Response.error()
      }
    })())
    return
  }
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreVary: true })
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
    return res
  })())
})
