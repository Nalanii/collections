import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runTransactionMock, getDocsMock } = vi.hoisted(() => ({
  runTransactionMock: vi.fn(),
  getDocsMock: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  FieldPath: class {
    constructor(...segments) {
      this.segments = segments
    }
  },
  getDoc: vi.fn(),
  getDocFromCache: vi.fn(),
  getDocs: getDocsMock,
  onSnapshot: vi.fn(),
  query: vi.fn(),
  runTransaction: runTransactionMock,
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}))
vi.mock('./firebase', () => ({ db: {} }))

import { collection, collectionGroup, getDoc, onSnapshot, query } from 'firebase/firestore'
import { subscribeToUserCollections, updateCollection } from './collections'
import { ConflictError } from './conflicts'

function ts(millis) {
  return { millis, isEqual: (other) => other?.millis === millis }
}

// Fake transactions reading from `docs` (paths to data). A transaction's updates are
// recorded in `commits` (one array of `{ path, update }` per transaction) only if its
// callback resolves, like a real commit; `docs` itself is not modified.
function mockStore(docs) {
  const commits = []
  runTransactionMock.mockImplementation(async (_db, callback) => {
    const pending = []
    const transaction = {
      get: vi.fn(async (ref) => ({
        id: ref.path.split('/').pop(),
        ref,
        exists: () => docs[ref.path] != null,
        data: () => docs[ref.path],
      })),
      update: vi.fn((ref, ...args) => {
        const update = {}
        if (args.length === 1) {
          Object.assign(update, args[0])
        } else {
          for (let i = 0; i < args.length; i += 2) {
            const key = typeof args[i] === 'string' ? args[i] : args[i].segments.join('.')
            update[key] = args[i + 1]
          }
        }
        pending.push({ path: ref.path, update })
      }),
    }
    const result = await callback(transaction)
    commits.push(pending)
    return result
  })
  getDocsMock.mockImplementation(async () => ({
    docs: Object.entries(docs)
      .filter(([path]) => path.startsWith('items/'))
      .map(([path, data]) => ({ id: path.split('/').pop(), ref: { path }, data: () => data })),
  }))
  return commits
}

const FIELD_DEFS = [
  { name: 'Title', type: 'text', main: true },
  { name: 'Format', type: 'dropdown', options: ['LP', 'CD'] },
]
const ORIGINAL = { name: 'Records', emoji: '📀', fieldDefs: FIELD_DEFS, updatedAt: ts(1) }

describe('updateCollection conflict handling', () => {
  beforeEach(() => {
    runTransactionMock.mockReset()
    getDocsMock.mockReset()
  })

  it('writes only the changed parts plus updatedAt when nothing changed meanwhile', async () => {
    const commits = mockStore({ 'collections/col1': { ...ORIGINAL, ownerId: 'o' } })
    await updateCollection('col1', { ...ORIGINAL, name: 'Vinyl', original: ORIGINAL })
    expect(commits).toEqual([
      [{ path: 'collections/col1', update: { name: 'Vinyl', updatedAt: 'SERVER_TIMESTAMP' } }],
    ])
  })

  it('merges with a concurrent edit to a different part', async () => {
    const commits = mockStore({
      'collections/col1': { ...ORIGINAL, emoji: '💿', updatedAt: ts(2) },
    })
    await updateCollection('col1', { ...ORIGINAL, name: 'Vinyl', original: ORIGINAL })
    expect(commits[0][0].update).toEqual({ name: 'Vinyl', updatedAt: 'SERVER_TIMESTAMP' })
  })

  it('rejects with a ConflictError when another owner changed the field definitions', async () => {
    const theirFieldDefs = [...FIELD_DEFS, { name: 'Label', type: 'text' }]
    const commits = mockStore({
      'collections/col1': { ...ORIGINAL, fieldDefs: theirFieldDefs, updatedAt: ts(2) },
    })
    const save = updateCollection('col1', {
      ...ORIGINAL,
      fieldDefs: [...FIELD_DEFS, { name: 'Year', type: 'number' }],
      original: ORIGINAL,
    })
    await expect(save).rejects.toBeInstanceOf(ConflictError)
    await expect(save).rejects.toMatchObject({ reason: 'changed', conflictingKeys: ['fieldDefs'] })
    expect(commits).toEqual([])
  })

  it('overwrites when forced', async () => {
    const commits = mockStore({
      'collections/col1': { ...ORIGINAL, name: 'Theirs', updatedAt: ts(2) },
    })
    await updateCollection('col1', { ...ORIGINAL, name: 'Mine', original: ORIGINAL, force: true })
    expect(commits[0][0].update).toEqual({ name: 'Mine', updatedAt: 'SERVER_TIMESTAMP' })
  })

  it('treats a collection saved before updatedAt existed as unchanged', async () => {
    const legacy = { name: 'Records', emoji: '📀', fieldDefs: FIELD_DEFS }
    const commits = mockStore({ 'collections/col1': legacy })
    await updateCollection('col1', { ...legacy, name: 'Vinyl', original: { ...legacy, updatedAt: null } })
    expect(commits).toHaveLength(1)
  })

  describe('option renames', () => {
    const renamedFieldDefs = [FIELD_DEFS[0], { ...FIELD_DEFS[1], options: ['Vinyl LP', 'CD'] }]
    const rename = { fieldName: 'Format', from: 'LP', to: 'Vinyl LP' }

    it('renames items and the definition in one transaction', async () => {
      const commits = mockStore({
        'collections/col1': ORIGINAL,
        'items/a': { collectionId: 'col1', fields: { Title: 'A', Format: 'LP' } },
        'items/b': { collectionId: 'col1', fields: { Title: 'B', Format: 'CD' } },
      })
      await updateCollection('col1', {
        ...ORIGINAL,
        fieldDefs: renamedFieldDefs,
        optionRenames: [rename],
        original: ORIGINAL,
      })
      expect(commits).toHaveLength(1)
      expect(commits[0]).toEqual([
        {
          path: 'collections/col1',
          update: { fieldDefs: renamedFieldDefs, updatedAt: 'SERVER_TIMESTAMP' },
        },
        { path: 'items/a', update: { 'fields.Format': 'Vinyl LP', updatedAt: 'SERVER_TIMESTAMP' } },
      ])
    })

    it('does not overwrite an item edited after the rename began', async () => {
      const docs = {
        'collections/col1': ORIGINAL,
        'items/a': { collectionId: 'col1', fields: { Title: 'A', Format: 'LP' } },
      }
      const commits = mockStore(docs)
      // Between the query and the transaction, another editor sets item a to CD.
      const queryImpl = getDocsMock.getMockImplementation()
      getDocsMock.mockImplementation(async (...args) => {
        const result = await queryImpl(...args)
        docs['items/a'] = { collectionId: 'col1', fields: { Title: 'A', Format: 'CD' } }
        return result
      })
      await updateCollection('col1', {
        ...ORIGINAL,
        fieldDefs: renamedFieldDefs,
        optionRenames: [rename],
        original: ORIGINAL,
      })
      expect(commits[0].map(({ path }) => path)).toEqual(['collections/col1'])
    })

    it('renames nothing when the definition conflicts', async () => {
      const commits = mockStore({
        'collections/col1': {
          ...ORIGINAL,
          fieldDefs: [FIELD_DEFS[0], { ...FIELD_DEFS[1], options: ['Record', 'CD'] }],
          updatedAt: ts(2),
        },
        'items/a': { collectionId: 'col1', fields: { Title: 'A', Format: 'LP' } },
      })
      await expect(
        updateCollection('col1', {
          ...ORIGINAL,
          fieldDefs: renamedFieldDefs,
          optionRenames: [rename],
          original: ORIGINAL,
        })
      ).rejects.toMatchObject({ name: 'ConflictError', conflictingKeys: ['fieldDefs'] })
      expect(commits).toEqual([])
    })

    it('stages large renames and refuses before touching items if the definition conflicts', async () => {
      const docs = {
        'collections/col1': { ...ORIGINAL, fieldDefs: [FIELD_DEFS[0]], updatedAt: ts(2) },
      }
      for (let i = 0; i < 600; i += 1) {
        docs[`items/i${i}`] = { collectionId: 'col1', fields: { Format: 'LP' } }
      }
      const commits = mockStore(docs)
      await expect(
        updateCollection('col1', {
          ...ORIGINAL,
          fieldDefs: renamedFieldDefs,
          optionRenames: [rename],
          original: ORIGINAL,
        })
      ).rejects.toBeInstanceOf(ConflictError)
      expect(commits).toEqual([])
    })

    it('stages large renames in chunks of at most 500 and writes the definition last', async () => {
      const docs = { 'collections/col1': ORIGINAL }
      for (let i = 0; i < 600; i += 1) {
        docs[`items/i${i}`] = { collectionId: 'col1', fields: { Format: 'LP' } }
      }
      const commits = mockStore(docs)
      await updateCollection('col1', {
        ...ORIGINAL,
        fieldDefs: renamedFieldDefs,
        optionRenames: [rename],
        original: ORIGINAL,
      })
      // Pre-check (no writes), two item chunks, then the definition.
      expect(commits.map((writes) => writes.length)).toEqual([0, 500, 100, 1])
      expect(commits[3][0].path).toBe('collections/col1')
    })
  })
})

describe('subscribeToUserCollections member counts', () => {
  // Fake snapshot listeners keyed by what they listen to: 'memberships' for the
  // collectionGroup query, or the members subcollection path.
  let listeners
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  beforeEach(() => {
    listeners = {}
    collection.mockImplementation((_db, ...path) => ({ key: path.join('/') }))
    collectionGroup.mockImplementation(() => ({ key: 'memberships' }))
    query.mockImplementation((source) => source)
    onSnapshot.mockImplementation((source, onNext, onError) => {
      const listener = { onNext, onError, active: true }
      listeners[source.key] = listener
      return vi.fn(() => {
        listener.active = false
      })
    })
    const collections = {
      own: { name: 'Mine', ownerId: 'me' },
      other: { name: 'Theirs', ownerId: 'them' },
    }
    getDoc.mockImplementation(async (ref) => ({
      id: ref.id,
      exists: () => true,
      data: () => collections[ref.id],
    }))
  })

  const membership = (collectionId, role) => ({
    ref: { parent: { parent: { id: collectionId } } },
    data: () => ({ role }),
  })
  const membersSnap = (size) => ({ size })

  it('adds memberCount to owned collections only, and updates it live', async () => {
    const callback = vi.fn()
    subscribeToUserCollections('me', callback)
    listeners.memberships.onNext({
      docs: [membership('own', 'owner'), membership('other', 'viewer')],
      metadata: { fromCache: false },
    })
    await flush()
    expect(Object.keys(listeners).sort()).toEqual(['collections/own/members', 'memberships'])

    listeners['collections/own/members'].onNext(membersSnap(3))
    const latest = callback.mock.calls.at(-1)[0]
    expect(latest.find((c) => c.id === 'own').memberCount).toBe(3)
    expect(latest.find((c) => c.id === 'other')).not.toHaveProperty('memberCount')

    listeners['collections/own/members'].onNext(membersSnap(1))
    expect(callback.mock.calls.at(-1)[0].find((c) => c.id === 'own').memberCount).toBe(1)
  })

  it('keeps the list when one collection count listener fails', async () => {
    const callback = vi.fn()
    subscribeToUserCollections('me', callback)
    listeners.memberships.onNext({ docs: [membership('own', 'owner')], metadata: {} })
    await flush()
    listeners['collections/own/members'].onError(new Error('permission-denied'))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toHaveLength(1)
    expect(callback.mock.calls[0][1]).toBeUndefined()
  })

  it('stops count listeners for dropped collections and on unsubscribe', async () => {
    const callback = vi.fn()
    const unsubscribe = subscribeToUserCollections('me', callback)
    listeners.memberships.onNext({ docs: [membership('own', 'owner')], metadata: {} })
    await flush()
    const countListener = listeners['collections/own/members']

    listeners.memberships.onNext({ docs: [], metadata: {} })
    await flush()
    expect(countListener.active).toBe(false)

    listeners.memberships.onNext({ docs: [membership('own', 'owner')], metadata: {} })
    await flush()
    const relistened = listeners['collections/own/members']
    expect(relistened.active).toBe(true)
    unsubscribe()
    expect(relistened.active).toBe(false)
    expect(listeners.memberships.active).toBe(false)
  })
})
