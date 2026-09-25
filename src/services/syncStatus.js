// Small shared store (useSyncExternalStore-compatible) for offline sync visibility:
// which item docs have local writes the server hasn't acknowledged yet, and which
// offline writes the server later rejected.
//
// Pending ids are tracked per listener (a Symbol key) and unioned, so the Home
// prefetch listener and the open collection's listener for the same collection
// don't double-count the same doc.
//
// Known limit: if the page is reloaded while offline, the queued write survives in
// Firestore's cache but the promise that would report its rejection is gone, so a
// rejection after such a reload produces no message. There is deliberately no custom
// write log to cover that.

const REJECTED_WRITE_MESSAGE =
  "A change you made offline couldn't be saved (you may no longer have permission). It has been reverted."

const EMPTY = { pendingCount: 0, rejections: [] }

let state = EMPTY
let nextRejectionId = 1
const pendingByListener = new Map()
const listeners = new Set()

function emit(next) {
  state = next
  listeners.forEach((listener) => listener())
}

function countPending() {
  const ids = new Set()
  pendingByListener.forEach((set) => set.forEach((id) => ids.add(id)))
  return ids.size
}

function refreshPending() {
  const pendingCount = countPending()
  if (pendingCount !== state.pendingCount) {
    emit({ ...state, pendingCount })
  }
}

export function subscribeSyncStatus(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSyncStatus() {
  return state
}

// Replaces the pending doc ids reported by one listener.
export function setListenerPending(listenerKey, docIds) {
  if (docIds.length === 0) {
    pendingByListener.delete(listenerKey)
  } else {
    pendingByListener.set(listenerKey, new Set(docIds))
  }
  refreshPending()
}

export function clearListenerPending(listenerKey) {
  if (pendingByListener.delete(listenerKey)) {
    refreshPending()
  }
}

export function reportRejectedWrite(message = REJECTED_WRITE_MESSAGE) {
  emit({ ...state, rejections: [...state.rejections, { id: nextRejectionId++, message }] })
}

export function dismissRejection(id) {
  emit({ ...state, rejections: state.rejections.filter((r) => r.id !== id) })
}

// Test helper: return to the initial empty state.
export function resetSyncStatus() {
  pendingByListener.clear()
  emit(EMPTY)
}
