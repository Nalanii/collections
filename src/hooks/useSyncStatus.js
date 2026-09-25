import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeSyncStatus } from '../services/syncStatus'

// `{ pendingCount, rejections: [{ id, message }] }`.
export function useSyncStatus() {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
}
