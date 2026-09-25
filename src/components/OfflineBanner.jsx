import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useSyncStatus } from '../hooks/useSyncStatus'
import { dismissRejection } from '../services/syncStatus'
import './OfflineBanner.css'

function changeCount(count) {
  return `${count} ${count === 1 ? 'change' : 'changes'}`
}

// Presentational so it can be rendered with explicit state.
export function OfflineBannerView({ online, pendingCount, rejections, onDismiss }) {
  return (
    <>
      {!online && (
        <p className="offline-banner" role="status">
          {pendingCount > 0
            ? `Offline — showing saved data. ${changeCount(pendingCount)} will sync when you're back online.`
            : "Offline — showing saved data. Changes will sync when you're back online."}
        </p>
      )}
      {online && pendingCount > 0 && (
        <p className="offline-banner" role="status">
          Syncing {changeCount(pendingCount)}…
        </p>
      )}
      {rejections.map((rejection) => (
        <p key={rejection.id} className="offline-banner offline-banner-error" role="alert">
          <span>{rejection.message}</span>
          <button
            type="button"
            className="offline-banner-dismiss"
            aria-label="Dismiss message"
            onClick={() => onDismiss(rejection.id)}
          >
            ×
          </button>
        </p>
      ))}
    </>
  )
}

export function OfflineBanner() {
  const online = useOnlineStatus()
  const { pendingCount, rejections } = useSyncStatus()
  return (
    <OfflineBannerView
      online={online}
      pendingCount={pendingCount}
      rejections={rejections}
      onDismiss={dismissRejection}
    />
  )
}
