import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteDocMock } = vi.hoisted(() => ({ deleteDocMock: vi.fn() }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: deleteDocMock,
  doc: vi.fn(),
  FieldPath: class {},
  onSnapshot: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}))
vi.mock('./firebase', () => ({ db: {} }))

import { deleteItem } from './items'
import { getSyncStatus, resetSyncStatus, setListenerPending } from './syncStatus'

describe('deleteItem pending tracking', () => {
  beforeEach(() => {
    resetSyncStatus()
    deleteDocMock.mockReset()
    vi.stubGlobal('navigator', { onLine: false })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('counts an offline delete as pending until the write is acknowledged', async () => {
    let ack
    deleteDocMock.mockReturnValue(new Promise((resolve) => (ack = resolve)))
    await deleteItem('item-1')
    expect(getSyncStatus().pendingCount).toBe(1)
    ack()
    await Promise.resolve()
    expect(getSyncStatus().pendingCount).toBe(0)
  })

  it('does not double count a delete that is also in a snapshot', async () => {
    setListenerPending('page', ['item-1'])
    deleteDocMock.mockReturnValue(new Promise(() => {}))
    await deleteItem('item-1')
    expect(getSyncStatus().pendingCount).toBe(1)
  })

  it('clears pending and reports a rejection when the offline delete is rejected', async () => {
    let reject
    deleteDocMock.mockReturnValue(new Promise((_, rej) => (reject = rej)))
    await deleteItem('item-1')
    reject(new Error('permission-denied'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const status = getSyncStatus()
    expect(status.pendingCount).toBe(0)
    expect(status.rejections).toHaveLength(1)
  })
})
