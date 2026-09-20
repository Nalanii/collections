import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

export async function createCollection(user, { name, emoji, fieldDefs }) {
  const newId = doc(collection(db, 'collections')).id
  const batch = writeBatch(db)

  batch.set(doc(db, 'collections', newId), {
    name,
    emoji,
    ownerId: user.uid,
    fieldDefs,
    createdAt: serverTimestamp(),
  })

  batch.set(doc(db, 'collections', newId, 'members', user.uid), {
    role: 'owner',
    joinedAt: serverTimestamp(),
  })

  await batch.commit()
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
