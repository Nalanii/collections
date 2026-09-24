const CACHE_NAME = 'collections-static-v3'
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/logo-192.png', '/logo-512.png']

// Extract same-origin /assets/* URLs (scripts, stylesheets, modulepreloads) from index.html
function extractAssetUrls(html) {
  const urls = new Set()
  const tagPattern = /<(?:script|link)\b[^>]*>/gi
  const attrPattern = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i
  for (const tag of html.match(tagPattern) || []) {
    const match = tag.match(attrPattern)
    if (!match) continue
    try {
      const url = new URL(match[1], self.location.origin)
      if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
        urls.add(url.pathname)
      }
    } catch {
      // ignore malformed URLs
    }
  }
  return [...urls]
}

async function getAssetUrls() {
  try {
    const response = await fetch('/index.html', { cache: 'no-cache' })
    if (!response.ok) return []
    return extractAssetUrls(await response.text())
  } catch {
    return []
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    Promise.all([caches.open(CACHE_NAME), getAssetUrls()]).then(([cache, assetUrls]) =>
      cache.addAll([...PRECACHE_URLS, ...assetUrls])
    )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone()
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone))
          )
        }
        return response
      }).catch(() => caches.match('/index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone()
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          )
        }
        return response
      })
    })
  )
})
