import {
  collection,
  deleteDoc,
  doc,
  FieldPath,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { changedFields } from '../utils/changedFields'
import { trimFieldValues } from '../utils/trimFieldValues'
import { clearListenerPending, reportRejectedWrite, setListenerPending } from './syncStatus'

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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
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
// Only fields that differ from `originalFields` are written, each via its own field
// path, so an edit made elsewhere (or while this device was offline) to a different
// field of the same item isn't overwritten. Same-field conflicts are last-write-wins.
export function updateItem(itemId, { status, fields, originalFields, notes }) {
  const changed = changedFields(originalFields, trimFieldValues(fields))
  const fieldUpdates = Object.entries(changed).flatMap(([name, value]) => [
    // FieldPath (not a "fields.<name>" string) so names containing dots still work.
    new FieldPath('fields', name),
    value,
  ])
  return settleWrite(
    updateDoc(
      doc(db, 'items', itemId),
      'status',
      status,
      'notes',
      trimNotes(notes),
      ...fieldUpdates,
      'updatedAt',
      serverTimestamp()
    )
  )
}

const MAX_BATCH_WRITES = 500

// Sets `fields.<fieldName>` to `newValue` on every item in `itemIds`, in batches of
// at most 500 writes. Uses a dot-path update so other fields are untouched. Returns
// the number of items updated.
export async function applyFieldValueChange(itemIds, fieldName, newValue) {
  const value = typeof newValue === 'string' ? newValue.trim() : newValue
  let changed = 0
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
  return changed
}

export function deleteItem(itemId) {
  return settleWrite(deleteDoc(doc(db, 'items', itemId)), [itemId])
}
