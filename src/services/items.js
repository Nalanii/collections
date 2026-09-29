import {
  collection,
  deleteDoc,
  doc,
  FieldPath,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { ConflictError } from './conflicts'
import { findItemConflicts, itemChanges, sameTimestamp } from '../utils/editConflicts'
import { trimFieldValues } from '../utils/trimFieldValues'
import { clearListenerPending, reportRejectedWrite, setListenerPending } from './syncStatus'

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// Firestore write promises only resolve once the server acknowledges the write, so
// offline they'd hang the UI even though the write is safely queued in the local
// cache. When offline, don't wait; the queued write syncs on reconnect (a later
// server rejection is logged and reported to the sync status store so the UI can
// tell the user; see syncStatus.js for the reload-while-offline limit).
//
// `pendingDocIds` are docs to count as pending until the write settles. Snapshots
// cover most writes, but a locally deleted doc vanishes from them, so deletes are
// registered explicitly (the store unions these with snapshot ids, no double count).
function settleWrite(writePromise, pendingDocIds = []) {
  if (pendingDocIds.length > 0) {
    const pendingKey = Symbol('pending write')
    setListenerPending(pendingKey, pendingDocIds)
    const clear = () => clearListenerPending(pendingKey)
    writePromise.then(clear, clear)
  }
  if (isOffline()) {
    writePromise.catch((err) => {
      console.error(err)
      reportRejectedWrite()
    })
    return Promise.resolve()
  }
  return writePromise
}

function trimNotes(notes) {
  return typeof notes === 'string' ? notes.trim() : notes
}

// `callback` is invoked as `callback(items, error)`. On a successful
// snapshot, `items` is an array of `{ id, ...itemDoc }` for every item
// whose `collectionId` field matches `collectionId`, and `error` is
// undefined. `items` is a top-level Firestore collection (not nested under
// `collections/{id}`), so membership is enforced by firestore.rules'
// isMember(resource.data.collectionId) check rather than by document path.
// On a listener error (e.g. `permission-denied`), `items` is `[]` and
// `error` is the Firestore error.
export function subscribeToItems(collectionId, callback) {
  const itemsQuery = query(collection(db, 'items'), where('collectionId', '==', collectionId))
  // Each listener reports its own docs with unacknowledged local writes to the sync
  // status store, which dedupes across listeners (e.g. prefetch + open collection).
  const listenerKey = Symbol(collectionId)
  const unsubscribe = onSnapshot(
    itemsQuery,
    (snapshot) => {
      setListenerPending(
        listenerKey,
        snapshot.docs.filter((docSnap) => docSnap.metadata.hasPendingWrites).map((docSnap) => docSnap.id)
      )
      callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
    },
    (error) => {
      clearListenerPending(listenerKey)
      callback([], error)
    }
  )
  return () => {
    unsubscribe()
    clearListenerPending(listenerKey)
  }
}

// Creates a new item doc in the top-level `items` collection. `user` is the
// signed-in Firebase Auth user; `collectionId` is the parent collection this
// item belongs to. `{ status, fields, notes }` matches the item data model:
// `status` is `'have'` or `'iso'`, `fields` is a `{ [fieldDefName]: value }`
// map, `notes` is freeform text. Returns the new item's id.
export async function addItem(user, collectionId, { status, fields, notes }) {
  const docRef = doc(collection(db, 'items'))
  await settleWrite(
    setDoc(docRef, {
      collectionId,
      status,
      fields: trimFieldValues(fields),
      notes: trimNotes(notes),
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  )
  return docRef.id
}

// Updates an existing item's editable fields. Deliberately never writes
// `collectionId` -- firestore.rules' items/update rule requires
// `request.resource.data.collectionId == resource.data.collectionId`, so
// changing an item's parent collection this way would be rejected anyway.
//
// `original` is the item as the edit form was opened with it (`{ status, notes,
// fields, updatedAt }`). Only values that differ from it are written, each via its
// own field path, so an edit someone else made to a different value of the same item
// is kept (and nothing is written when nothing changed).
//
// Online, the write runs in a transaction that re-reads the item. If it was deleted,
// or its `updatedAt` moved on and someone else changed one of the same values to
// something different, a ConflictError is thrown and nothing is written. `force`
// skips the "changed" check (the editor chose to overwrite); only the editor's own
// changes are still written.
//
// Offline, transactions can't run, so the dot-path write is queued as before and
// same-value conflicts are last-write-wins when it syncs.
export async function updateItem(itemId, { status, fields, notes, original, force = false }) {
  const edited = { status, fields: trimFieldValues(fields), notes: trimNotes(notes) }
  const changes = itemChanges(original, edited)
  if (changes.length === 0) {
    return
  }
  const itemRef = doc(db, 'items', itemId)
  const updateArgs = [
    // FieldPath (not a "fields.<name>" string) so field names containing dots still work.
    ...changes.flatMap(({ path, value }) => [new FieldPath(...path), value]),
    'updatedAt',
    serverTimestamp(),
  ]

  if (isOffline()) {
    return settleWrite(updateDoc(itemRef, ...updateArgs))
  }

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(itemRef)
    if (!snap.exists()) {
      throw new ConflictError({ reason: 'deleted' })
    }
    const current = snap.data()
    if (!force && !sameTimestamp(current.updatedAt, original?.updatedAt)) {
      const conflictingKeys = findItemConflicts(changes, original, current)
      if (conflictingKeys.length > 0) {
        throw new ConflictError({
          reason: 'changed',
          latest: { id: snap.id, ...current },
          conflictingKeys,
        })
      }
    }
    transaction.update(itemRef, ...updateArgs)
  })
}

const MAX_BATCH_WRITES = 500

// Sets `fields.<fieldName>` to `newValue` on every item in `itemIds`. Uses a dot-path
// update so other fields are untouched. Returns `{ changed, skipped }`.
//
// `variantValues` is the set of whitespace-collapsed values the caller saw on those
// items when it picked them. Online, each item is updated in its own transaction that
// re-reads it: if the item was deleted, or its current value no longer collapses to
// one of `variantValues` (someone edited it since), it is left alone and counted in
// `skipped`. An item that already holds `newValue` is left alone without being counted.
//
// Offline, transactions can't run, so the updates are queued in batches of at most 500
// writes as before, with no re-check; every item counts as changed.
export async function applyFieldValueChange(itemIds, fieldName, newValue, variantValues) {
  const value = typeof newValue === 'string' ? newValue.trim() : newValue
  const variants = new Set(variantValues)
  let changed = 0
  let skipped = 0

  if (!isOffline()) {
    for (let start = 0; start < itemIds.length; start += MAX_BATCH_WRITES) {
      const chunk = itemIds.slice(start, start + MAX_BATCH_WRITES)
      const outcomes = await Promise.all(
        chunk.map((itemId) => {
          const itemRef = doc(db, 'items', itemId)
          return runTransaction(db, async (transaction) => {
            const snap = await transaction.get(itemRef)
            if (!snap.exists()) return 'skipped'
            const raw = snap.data().fields?.[fieldName]
            if (raw == null) return 'skipped'
            if (!variants.has(String(raw).replace(/\s+/g, ' ').trim())) return 'skipped'
            if (raw === value) return 'unchanged'
            // FieldPath (not a "fields.<name>" string) so names containing dots still work.
            transaction.update(
              itemRef,
              new FieldPath('fields', fieldName),
              value,
              'updatedAt',
              serverTimestamp()
            )
            return 'changed'
          })
        })
      )
      changed += outcomes.filter((outcome) => outcome === 'changed').length
      skipped += outcomes.filter((outcome) => outcome === 'skipped').length
    }
    return { changed, skipped }
  }

  for (let start = 0; start < itemIds.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(db)
    const chunk = itemIds.slice(start, start + MAX_BATCH_WRITES)
    for (const itemId of chunk) {
      // FieldPath (not a "fields.<name>" string) so names containing dots still work.
      batch.update(
        doc(db, 'items', itemId),
        new FieldPath('fields', fieldName),
        value,
        'updatedAt',
        serverTimestamp()
      )
    }
    await settleWrite(batch.commit())
    changed += chunk.length
  }
  return { changed, skipped }
}

export function deleteItem(itemId) {
  return settleWrite(deleteDoc(doc(db, 'items', itemId)), [itemId])
}
