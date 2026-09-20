import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'

export async function createCollection(user, { name, emoji, fieldDefs }) {
  const newId = doc(collection(db, 'collections')).id
  const collectionRef = doc(db, 'collections', newId)
  const memberRef = doc(db, 'collections', newId, 'members', user.uid)

  // firestore.rules' members/{uid} owner-bootstrap rule does
  // get(collections/{id}).data.ownerId == request.auth.uid. Neither
  // writeBatch nor runTransaction lets that get() see an uncommitted
  // sibling write earlier in the same batch/transaction (rules' own
  // get()/exists() calls only ever see already-committed state, unlike a
  // transaction's own transaction.get() client reads) -- so both fail with
  // PERMISSION_DENIED here. The collection doc must be fully committed
  // before the members doc write is attempted, hence two sequential
  // awaited writes instead of one atomic batch/transaction.
  await setDoc(collectionRef, {
    name,
    emoji,
    ownerId: user.uid,
    fieldDefs,
    createdAt: serverTimestamp(),
  })

  await setDoc(memberRef, {
    role: 'owner',
    joinedAt: serverTimestamp(),
  })

  return newId
}

export function updateCollection(collectionId, { name, emoji, fieldDefs }) {
  return updateDoc(doc(db, 'collections', collectionId), { name, emoji, fieldDefs })
}

export function deleteCollection(collectionId) {
  return deleteDoc(doc(db, 'collections', collectionId))
}

export function subscribeToCollection(collectionId, callback) {
  return onSnapshot(doc(db, 'collections', collectionId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}
