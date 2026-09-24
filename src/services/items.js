import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  FieldPath,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { trimFieldValues } from '../utils/trimFieldValues'

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
  return onSnapshot(
    itemsQuery,
    (snapshot) => {
      callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
    },
    (error) => {
      callback([], error)
    }
  )
}

// Creates a new item doc in the top-level `items` collection. `user` is the
// signed-in Firebase Auth user; `collectionId` is the parent collection this
// item belongs to. `{ status, fields, notes }` matches the item data model:
// `status` is `'have'` or `'iso'`, `fields` is a `{ [fieldDefName]: value }`
// map, `notes` is freeform text. Returns the new item's id.
export async function addItem(user, collectionId, { status, fields, notes }) {
  const docRef = await addDoc(collection(db, 'items'), {
    collectionId,
    status,
    fields: trimFieldValues(fields),
    notes: trimNotes(notes),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

// Updates an existing item's editable fields. Deliberately never writes
// `collectionId` -- firestore.rules' items/update rule requires
// `request.resource.data.collectionId == resource.data.collectionId`, so
// changing an item's parent collection this way would be rejected anyway.
export function updateItem(itemId, { status, fields, notes }) {
  return updateDoc(doc(db, 'items', itemId), {
    status,
    fields: trimFieldValues(fields),
    notes: trimNotes(notes),
    updatedAt: serverTimestamp(),
  })
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
    await batch.commit()
    changed += chunk.length
  }
  return changed
}

export function deleteItem(itemId) {
  return deleteDoc(doc(db, 'items', itemId))
}
