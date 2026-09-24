import { useOnlineStatus } from '../hooks/useOnlineStatus'
import './OfflineBanner.css'

export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) {
    return null
  }
  return (
    <p className="offline-banner" role="status">
      Offline — showing saved data. Changes will sync when you're back online.
    </p>
  )
}
