import { useState, useSyncExternalStore } from 'react'
import { applyTheme, getStoredTheme, saveTheme } from '../theme.js'
import './ThemeToggle.css'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribeToSystemTheme(callback) {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function getSystemIsDark() {
  return window.matchMedia(DARK_QUERY).matches
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
      <path d="M565-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-226.5 56.5Q280-397 280-480t58.5-141.5Q397-680 480-680t141.5 58.5Q680-563 680-480t-58.5 141.5Q563-280 480-280t-141.5-58.5ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Zm326-268Z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
      <path d="M560-80q-82 0-155-31.5t-127.5-86Q223-252 191.5-325T160-480.5q0-82.5 31.5-155t86-127Q332-817 405-848.5T560-880q54 0 105 14t95 40q-91 53-145.5 143.5T560-480q0 112 54.5 202.5T760-134q-44 26-95 40T560-80Zm0-80h21q10 0 19-2-57-66-88.5-147.5T480-480q0-89 31.5-170.5T600-798q-9-2-19-2h-21q-133 0-226.5 93.5T240-480q0 133 93.5 226.5T560-160Zm-80-320Z" />
    </svg>
  )
}

// No explicit "system" option: with no saved choice the app follows the OS, and
// the first click saves an explicit light/dark override.
export function ThemeToggle() {
  const [stored, setStored] = useState(getStoredTheme)
  const systemIsDark = useSyncExternalStore(subscribeToSystemTheme, getSystemIsDark)
  const isDark = stored === 'system' ? systemIsDark : stored === 'dark'

  function handleClick() {
    const next = isDark ? 'light' : 'dark'
    setStored(next)
    saveTheme(next)
    applyTheme(next)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={handleClick}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
