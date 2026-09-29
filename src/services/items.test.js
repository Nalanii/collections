import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deleteDocMock, runTransactionMock, updateDocMock, setDocMock, writeBatchMock } = vi.hoisted(() => ({
  writeBatchMock: vi.fn(),
  deleteDocMock: vi.fn(),
  runTransactionMock: vi.fn(),
  updateDocMock: vi.fn(),
  setDocMock: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteDoc: deleteDocMock,
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  FieldPath: class {
    constructor(...segments) {
      this.segments = segments
    }
  },
  onSnapshot: vi.fn(),
  query: vi.fn(),
  runTransaction: runTransactionMock,
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: setDocMock,
  updateDoc: updateDocMock,
  where: vi.fn(),
  writeBatch: writeBatchMock,
}))
vi.mock('./firebase', () => ({ db: {} }))

import { addItem, applyFieldValueChange, deleteItem, updateItem } from './items'
import { ConflictError } from './conflicts'
import { getSyncStatus, resetSyncStatus, setListenerPending } from './syncStatus'

function ts(millis) {
  return { millis, isEqual: (other) => other?.millis === millis }
}

// Runs the transaction callback against `storedItem` (null = deleted) and records
// the update it makes, as `{ path: value }` with FieldPaths joined by '.'.
function mockItemTransaction(storedItem) {
  const updates = []
  runTransactionMock.mockImplementation(async (_db, callback) => {
    const transaction = {
      get: vi.fn(async (ref) => ({
        id: ref.path.split('/').pop(),
        ref,
        exists: () => storedItem != null,
        data: () => storedItem,
      })),
      update: vi.fn((ref, ...args) => {
        const update = {}
        for (let i = 0; i < args.length; i += 2) {
          const key = typeof args[i] === 'string' ? args[i] : args[i].segments.join('.')
          update[key] = args[i + 1]
        }
        updates.push({ ref, update })
      }),
    }
    return callback(transaction)
  })
  return updates
}

const ORIGINAL = {
  status: 'have',
  notes: '',
  fields: { Title: 'Abbey Road', Format: 'LP' },
  updatedAt: ts(1),
}

describe('updateItem conflict handling', () => {
  beforeEach(() => {
    resetSyncStatus()
    runTransactionMock.mockReset()
    updateDocMock.mockReset()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('writes only the changed values when the item is unchanged since opening', async () => {
    const updates = mockItemTransaction({ ...ORIGINAL, collectionId: 'col1' })
    await updateItem('item-1', {
      status: 'have',
      notes: '',
      fields: { Title: 'Abbey Road (Remaster)', Format: 'LP' },
      original: ORIGINAL,
    })
    expect(updates).toEqual([
      {
        ref: { path: 'items/item-1' },
        update: { 'fields.Title': 'Abbey Road (Remaster)', updatedAt: 'SERVER_TIMESTAMP' },
      },
    ])
  })

  it('merges with a concurrent edit to a different value', async () => {
    const updates = mockItemTransaction({
      ...ORIGINAL,
      fields: { ...ORIGINAL.fields, Format: 'CD' },
      notes: 'signed',
      updatedAt: ts(2),
    })
    await updateItem('item-1', {
      status: 'iso',
      notes: '',
      fields: { Title: 'Abbey Road', Format: 'LP' },
      original: ORIGINAL,
    })
    // Only status is written; the other editor's Format and notes are kept.
    expect(updates[0].update).toEqual({ status: 'iso', updatedAt: 'SERVER_TIMESTAMP' })
  })

  it('rejects with a ConflictError when someone else changed the same value', async () => {
    const latest = { ...ORIGINAL, fields: { ...ORIGINAL.fields, Title: 'Let It Be' }, updatedAt: ts(2) }
    const updates = mockItemTransaction(latest)
    const save = updateItem('item-1', {
      status: 'have',
      notes: '',
      fields: { Title: 'Help!', Format: 'LP' },
      original: ORIGINAL,
    })
    await expect(save).rejects.toBeInstanceOf(ConflictError)
    await expect(save).rejects.toMatchObject({
      reason: 'changed',
      conflictingKeys: [['fields', 'Title']],
      latest: { id: 'item-1', fields: { Title: 'Let It Be' } },
    })
    expect(updates).toEqual([])
  })

  it('overwrites the conflicting value when forced, still writing only the editor’s changes', async () => {
    const updates = mockItemTransaction({
      ...ORIGINAL,
      fields: { Title: 'Let It Be', Format: 'CD' },
      updatedAt: ts(2),
    })
    await updateItem('item-1', {
      status: 'have',
      notes: '',
      fields: { Title: 'Help!', Format: 'LP' },
      original: ORIGINAL,
      force: true,
    })
    expect(updates[0].update).toEqual({ 'fields.Title': 'Help!', updatedAt: 'SERVER_TIMESTAMP' })
  })

  it('rejects with a "deleted" ConflictError when the item was deleted', async () => {
    const updates = mockItemTransaction(null)
    await expect(
      updateItem('item-1', {
        status: 'iso',
        notes: '',
        fields: ORIGINAL.fields,
        original: ORIGINAL,
        force: true,
      })
    ).rejects.toMatchObject({ name: 'ConflictError', reason: 'deleted' })
    expect(updates).toEqual([])
  })

  it('writes nothing when nothing changed', async () => {
    await updateItem('item-1', { status: 'have', notes: '', fields: ORIGINAL.fields, original: ORIGINAL })
    expect(runTransactionMock).not.toHaveBeenCalled()
    expect(updateDocMock).not.toHaveBeenCalled()
  })

  it('queues a plain dot-path update offline instead of a transaction', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    updateDocMock.mockReturnValue(new Promise(() => {}))
    await updateItem('item-1', {
      status: 'have',
      notes: 'mint',
      fields: ORIGINAL.fields,
      original: ORIGINAL,
    })
    expect(runTransactionMock).not.toHaveBeenCalled()
    const [ref, field, value, ...rest] = updateDocMock.mock.calls[0]
    expect(ref).toEqual({ path: 'items/item-1' })
    expect(field.segments).toEqual(['notes'])
    expect(value).toBe('mint')
    expect(rest).toEqual(['updatedAt', 'SERVER_TIMESTAMP'])
  })
})

// Runs each per-item transaction against `stored` (`{ [itemId]: item | null }`, null =
// deleted) and records the updates as `{ id, update }`.
function mockItemsTransaction(stored) {
  const updates = []
  runTransactionMock.mockImplementation(async (_db, callback) => {
    const transaction = {
      get: vi.fn(async (ref) => {
        const item = stored[ref.path.split('/').pop()]
        return { exists: () => item != null, data: () => item }
      }),
      update: vi.fn((ref, path, value, ...rest) => {
        updates.push({ id: ref.path.split('/').pop(), path: path.segments, value, rest })
      }),
    }
    return callback(transaction)
  })
  return updates
}

describe('applyFieldValueChange', () => {
  beforeEach(() => {
    runTransactionMock.mockReset()
    writeBatchMock.mockReset()
    vi.stubGlobal('navigator', { onLine: true })
  })

  const variants = new Set(['The Beatles', 'the beatles'])

  it('updates items whose current value is still one of the variants', async () => {
    const updates = mockItemsTransaction({
      a: { fields: { Artist: 'the  beatles' } },
      b: { fields: { Artist: 'the beatles' } },
    })
    const result = await applyFieldValueChange(['a', 'b'], 'Artist', ' The Beatles ', variants)
    expect(result).toEqual({ changed: 2, skipped: 0 })
    expect(updates).toEqual([
      { id: 'a', path: ['fields', 'Artist'], value: 'The Beatles', rest: ['updatedAt', 'SERVER_TIMESTAMP'] },
      { id: 'b', path: ['fields', 'Artist'], value: 'The Beatles', rest: ['updatedAt', 'SERVER_TIMESTAMP'] },
    ])
  })

  it('skips an item edited to something else since the variants were loaded', async () => {
    const updates = mockItemsTransaction({
      a: { fields: { Artist: 'the beatles' } },
      b: { fields: { Artist: 'Wings' } },
      c: { fields: {} },
    })
    const result = await applyFieldValueChange(['a', 'b', 'c'], 'Artist', 'The Beatles', variants)
    expect(result).toEqual({ changed: 1, skipped: 2 })
    expect(updates.map((update) => update.id)).toEqual(['a'])
  })

  it('skips an item deleted since the variants were loaded', async () => {
    const updates = mockItemsTransaction({ a: { fields: { Artist: 'the beatles' } }, b: null })
    const result = await applyFieldValueChange(['a', 'b'], 'Artist', 'The Beatles', variants)
    expect(result).toEqual({ changed: 1, skipped: 1 })
    expect(updates.map((update) => update.id)).toEqual(['a'])
  })

  it('does not write or count an item that already holds the new value', async () => {
    const updates = mockItemsTransaction({ a: { fields: { Artist: 'The Beatles' } } })
    const result = await applyFieldValueChange(['a'], 'Artist', 'The Beatles', variants)
    expect(result).toEqual({ changed: 0, skipped: 0 })
    expect(updates).toEqual([])
  })

  it('queues a batched write offline instead of transactions', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const batch = { update: vi.fn(), commit: vi.fn(() => new Promise(() => {})) }
    writeBatchMock.mockReturnValue(batch)
    const result = await applyFieldValueChange(['a', 'b'], 'Artist', 'The Beatles', variants)
    expect(result).toEqual({ changed: 2, skipped: 0 })
    expect(runTransactionMock).not.toHaveBeenCalled()
    expect(batch.update).toHaveBeenCalledTimes(2)
    expect(batch.commit).toHaveBeenCalledTimes(1)
  })
})

describe('addItem', () => {
  beforeEach(() => {
    runTransactionMock.mockReset()
    setDocMock.mockReset()
    setDocMock.mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('creates items with a plain write, so concurrent adds never conflict', async () => {
    await addItem({ uid: 'u1' }, 'col1', { status: 'have', fields: { Title: 'A' }, notes: '' })
    await addItem({ uid: 'u2' }, 'col1', { status: 'have', fields: { Title: 'A' }, notes: '' })
    expect(setDocMock).toHaveBeenCalledTimes(2)
    expect(runTransactionMock).not.toHaveBeenCalled()
  })
})

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
