import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearListenerPending,
  dismissRejection,
  getSyncStatus,
  reportRejectedWrite,
  resetSyncStatus,
  setListenerPending,
  subscribeSyncStatus,
} from './syncStatus'

describe('syncStatus', () => {
  beforeEach(() => resetSyncStatus())

  it('counts pending docs across listeners', () => {
    setListenerPending('a', ['1', '2'])
    setListenerPending('b', ['3'])
    expect(getSyncStatus().pendingCount).toBe(3)
  })

  it('does not double count a doc reported by two listeners', () => {
    setListenerPending('prefetch', ['1', '2'])
    setListenerPending('page', ['2'])
    expect(getSyncStatus().pendingCount).toBe(2)
  })

  it('drops a listener count when it reports none or is cleared', () => {
    setListenerPending('a', ['1'])
    setListenerPending('b', ['2'])
    setListenerPending('a', [])
    expect(getSyncStatus().pendingCount).toBe(1)
    clearListenerPending('b')
    expect(getSyncStatus().pendingCount).toBe(0)
  })

  it('keeps a stable snapshot when nothing changed and notifies on change', () => {
    let calls = 0
    const unsubscribe = subscribeSyncStatus(() => calls++)
    setListenerPending('a', [])
    expect(calls).toBe(0)
    setListenerPending('a', ['1'])
    expect(calls).toBe(1)
    unsubscribe()
    setListenerPending('a', [])
    expect(calls).toBe(1)
  })

  it('records and dismisses rejected writes', () => {
    reportRejectedWrite('nope')
    reportRejectedWrite('again')
    const [first, second] = getSyncStatus().rejections
    expect(first.message).toBe('nope')
    dismissRejection(first.id)
    expect(getSyncStatus().rejections).toEqual([second])
  })

  it('uses a default message for rejected writes', () => {
    reportRejectedWrite()
    expect(getSyncStatus().rejections[0].message).toContain("couldn't be saved")
  })
})
