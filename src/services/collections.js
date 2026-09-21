import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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

  // The collections doc write above is committed, but the members doc write
  // below is a second, separate network call that can still fail on its own
  // (transient network blip, etc). If it does, retry a couple of times with
  // a short fixed delay before giving up -- this converts most transient
  // failures into successes. If it still fails after retries, the
  // collections/{newId} doc already exists but is now orphaned (unreadable
  // and undeletable per firestore.rules, which require the members doc for
  // access) -- throw an error carrying `collectionId` so a caller can log or
  // act on the orphan rather than silently losing track of it.
  const MEMBER_WRITE_RETRIES = 2
  const MEMBER_WRITE_RETRY_DELAY_MS = 300

  let lastError
  for (let attempt = 0; attempt <= MEMBER_WRITE_RETRIES; attempt += 1) {
    try {
      await setDoc(memberRef, {
        uid: user.uid,
        role: 'owner',
        email: user.email,
        joinedAt: serverTimestamp(),
      })
      return newId
    } catch (err) {
      lastError = err
      if (attempt < MEMBER_WRITE_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, MEMBER_WRITE_RETRY_DELAY_MS))
      }
    }
  }

  throw Object.assign(
    new Error(
      `Failed to create owner membership for collection ${newId} after retries; the collection doc exists but is orphaned.`
    ),
    { collectionId: newId, cause: lastError }
  )
}

export function updateCollection(collectionId, { name, emoji, fieldDefs }) {
  return updateDoc(doc(db, 'collections', collectionId), { name, emoji, fieldDefs })
}

export function deleteCollection(collectionId) {
  return deleteDoc(doc(db, 'collections', collectionId))
}

// `callback` is invoked as `callback(collections, error)`. On a successful
// snapshot, `collections` is an array of `{ id, ...collectionDoc, role }` for
// every collection the user is a member of, and `error` is undefined. Member
// docs are matched on their own `uid` field (not the doc ID) because a
// collectionGroup query can only filter on document fields, not on the last
// segment of each document's path. On a listener error (e.g.
// `permission-denied`), `collections` is `[]` and `error` is the Firestore
// error.
export function subscribeToUserCollections(uid, callback) {
  const membershipsQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid))
  return onSnapshot(
    membershipsQuery,
    async (snapshot) => {
      try {
        const entries = await Promise.all(
          snapshot.docs.map(async (memberSnap) => {
            const collectionSnap = await getDoc(memberSnap.ref.parent.parent)
            if (!collectionSnap.exists()) {
              return null
            }
            return {
              id: collectionSnap.id,
              ...collectionSnap.data(),
              role: memberSnap.data().role,
            }
          })
        )
        callback(entries.filter((entry) => entry != null))
      } catch (err) {
        callback([], err)
      }
    },
    (error) => {
      callback([], error)
    }
  )
}

// `callback` is invoked as `callback(data, error)`. On a successful snapshot,
// `data` is the collection doc (or `null` if it doesn't exist) and `error` is
// undefined. On a listener error (e.g. `permission-denied`, or the doc being
// deleted out from under an open listener in a way the rules then reject),
// `data` is `null` and `error` is the Firestore error -- callers must check
// the second argument rather than assuming every call is a successful
// snapshot, since the success handler never fires again after an error.
export function subscribeToCollection(collectionId, callback) {
  return onSnapshot(
    doc(db, 'collections', collectionId),
    (snap) => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    (error) => {
      callback(null, error)
    }
  )
}

// `callback` is invoked as `callback(members, error)`. On a successful
// snapshot, `members` is an array of `{ uid, role, email?, joinedAt }` for
// every doc in `collections/{collectionId}/members` (uid comes from the doc
// ID, not a lookup). `email` is only present on member docs written after
// this field was added -- older docs may omit it. On a listener error (e.g.
// `permission-denied`), `members` is `[]` and `error` is the Firestore
// error.
export function subscribeToMembers(collectionId, callback) {
  return onSnapshot(
    collection(db, 'collections', collectionId, 'members'),
    (snapshot) => {
      callback(snapshot.docs.map((docSnap) => ({ uid: docSnap.id, ...docSnap.data() })))
    },
    (error) => {
      callback([], error)
    }
  )
}

// Deletes a `collections/{collectionId}/members/{uid}` doc. Used both for an
// owner revoking another member's access and for a member leaving on their
// own -- firestore.rules' delete rule for this path already distinguishes
// the two cases (owner deleting someone else vs. a non-owner deleting their
// own doc) and rejects an owner trying to delete their own.
export function removeMember(collectionId, uid) {
  return deleteDoc(doc(db, 'collections', collectionId, 'members', uid))
}
