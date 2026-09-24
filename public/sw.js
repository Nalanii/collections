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

// Extract /assets/* references (absolute, or "./" relative to the bundle's own URL) from a JS/CSS bundle
const ASSET_EXTENSIONS = 'png|svg|webp|jpg|jpeg|gif|avif|woff2|woff|ttf|css|js'
const BUNDLE_REF_PATTERN = new RegExp(
  `["'\`(](\\/assets\\/|\\.\\/)([\\w.-]+\\.(?:${ASSET_EXTENSIONS}))(?=["'\`)?#])`,
  'g'
)

function extractBundleRefs(text, bundlePath) {
  const urls = new Set()
  for (const match of text.matchAll(BUNDLE_REF_PATTERN)) {
    try {
      const url = new URL(match[1] + match[2], new URL(bundlePath, self.location.origin))
      if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
        urls.add(url.pathname)
      }
    } catch {
      // ignore malformed URLs
    }
  }
  return urls
}

// Follow references found in JS/CSS bundles (images, fonts, lazy chunks) so they work offline
async function discoverBundleAssets(initialUrls) {
  const found = new Set(initialUrls)
  const queue = initialUrls.filter((url) => /\.(?:js|css)$/.test(url))
  const scanned = new Set()
  while (queue.length > 0 && scanned.size < 200) {
    const bundlePath = queue.shift()
    if (scanned.has(bundlePath)) continue
    scanned.add(bundlePath)
    try {
      const response = await fetch(bundlePath)
      if (!response.ok) continue
      for (const url of extractBundleRefs(await response.text(), bundlePath)) {
        if (found.has(url)) continue
        found.add(url)
        if (/\.(?:js|css)$/.test(url)) queue.push(url)
      }
    } catch {
      // ignore bundle fetch/parse failures; keep what we have
    }
  }
  return [...found]
}

async function getAssetUrls() {
  let urls = []
  try {
    const response = await fetch('/index.html', { cache: 'no-cache' })
    if (!response.ok) return []
    urls = extractAssetUrls(await response.text())
  } catch {
    return []
  }
  try {
    return await discoverBundleAssets(urls)
  } catch {
    return urls
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
