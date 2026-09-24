const STORAGE_KEY = 'theme'
const THEME_COLORS = { light: '#f4f2eb', dark: '#14161a' }

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

// Applies the choice to <html> and keeps <meta name="theme-color"> in sync.
// For 'system' the media-specific meta tags from index.html take over again.
export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme)
  } else {
    root.removeAttribute('data-theme')
  }

  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute('media') || ''
    const systemColor = media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light
    meta.setAttribute('content', THEME_COLORS[theme] ?? systemColor)
  })
}

export function saveTheme(theme) {
  try {
    if (theme === 'light' || theme === 'dark') {
      localStorage.setItem(STORAGE_KEY, theme)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage unavailable (private mode, blocked); the choice just won't persist.
  }
}
