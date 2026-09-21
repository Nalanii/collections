import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

export async function createInvite(inviterUid, collectionId, email, role) {
  await setDoc(doc(db, 'collections', collectionId, 'invites', email), {
    email,
    role,
    invitedBy: inviterUid,
    invitedAt: serverTimestamp(),
  })
}

// `callback` is invoked as `callback(invites, error)`. On a successful
// snapshot, `invites` is an array of
// `{ collectionId, email, role, invitedBy, collectionName, collectionEmoji }`
// for every invite doc matching `email`. Invite docs are matched on their own
// `email` field (not the doc ID) because a collectionGroup query can only
// filter on document fields, not on the last segment of each document's
// path. Invites whose parent collection doc no longer exists are skipped. On
// a listener error (e.g. `permission-denied`), `invites` is `[]` and `error`
// is the Firestore error.
export function subscribeToUserInvites(email, callback) {
  const invitesQuery = query(collectionGroup(db, 'invites'), where('email', '==', email))
  return onSnapshot(
    invitesQuery,
    async (snapshot) => {
      try {
        const entries = await Promise.all(
          snapshot.docs.map(async (inviteSnap) => {
            const collectionSnap = await getDoc(inviteSnap.ref.parent.parent)
            if (!collectionSnap.exists()) {
              return null
            }
            const inviteData = inviteSnap.data()
            return {
              collectionId: collectionSnap.id,
              email: inviteData.email,
              role: inviteData.role,
              invitedBy: inviteData.invitedBy,
              collectionName: collectionSnap.data().name,
              collectionEmoji: collectionSnap.data().emoji,
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

export async function acceptInvite(user, collectionId, role, email) {
  // Mirrors createCollection's two-step write: firestore.rules' get()/exists()
  // calls only see already-committed state, so the membership doc must be
  // fully committed before the invite doc can be deleted (delete rules for
  // invites depend on the member's role). Sequential awaited writes, not a
  // batch/transaction.
  await setDoc(doc(db, 'collections', collectionId, 'members', user.uid), {
    uid: user.uid,
    role,
    joinedAt: serverTimestamp(),
  })

  await deleteDoc(doc(db, 'collections', collectionId, 'invites', email))
}

export function declineInvite(collectionId, email) {
  return deleteDoc(doc(db, 'collections', collectionId, 'invites', email))
}
