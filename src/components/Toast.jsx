import { useEffect } from 'react'
import './Toast.css'

export const TOAST_DURATION_MS = 3000

// Generic, non-blocking success toast. It renders inline where you place it; pass `className`
// to position it. The parent owns the message and clears it in onDismiss; give it a changing
// `key` to restart the auto-dismiss timer for a new message.
export function Toast({ message, onDismiss, duration = TOAST_DURATION_MS, className = '' }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [onDismiss, duration])

  return (
    <p className={`toast toast-success ${className}`.trim()} role="status" aria-live="polite">
      {message}
    </p>
  )
}
