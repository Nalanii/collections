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

// Applies an explicit 'light' or 'dark' choice to <html> and keeps
// <meta name="theme-color"> in sync. With no saved choice nothing is applied
// and the media-specific meta tags from index.html follow the OS.
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)

  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', THEME_COLORS[theme])
  })
}

// Persists an explicit 'light' or 'dark' choice.
export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage unavailable (private mode, blocked); the choice just won't persist.
  }
}
