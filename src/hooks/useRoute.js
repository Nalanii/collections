import { useCallback, useEffect, useState } from 'react'

function parsePath(pathname) {
  if (pathname === '/admin') {
    return { view: 'admin', collectionId: null }
  }

  const adminMatch = pathname.match(/^\/admin\/([^/]+)$/)
  if (adminMatch) {
    return { view: 'admin', collectionId: decodeURIComponent(adminMatch[1]) }
  }

  const collectionMatch = pathname.match(/^\/collections\/([^/]+)$/)
  if (collectionMatch) {
    return { view: 'collection', collectionId: decodeURIComponent(collectionMatch[1]) }
  }

  return { view: 'home', collectionId: null }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parsePath(window.location.pathname))

  useEffect(() => {
    function handlePopState() {
      setRoute(parsePath(window.location.pathname))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((path, { replace = false } = {}) => {
    if (replace) {
      window.history.replaceState(null, '', path)
    } else {
      window.history.pushState(null, '', path)
    }
    setRoute(parsePath(path))
  }, [])

  return [route, navigate]
}
