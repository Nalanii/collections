import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  FieldPath,
  getDoc,
  getDocFromCache,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { applyOptionRenames } from '../utils/fieldOptions'
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
        displayName: user.displayName,
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

  // Best-effort cleanup so no stray collection doc is left behind. The owner
  // has no member doc yet, so isOwner() would refuse this delete; the rules
  // therefore allow it via the creator's ownerId (see firestore.rules).
  let cleanedUp = false
  try {
    await deleteDoc(collectionRef)
    cleanedUp = true
  } catch {
    // Leave it; the error below carries collectionId for the caller.
  }

  throw Object.assign(
    new Error(
      `Failed to create owner membership for collection ${newId} after retries; ${
        cleanedUp ? 'the collection doc was removed.' : 'the collection doc exists but is orphaned.'
      }`
    ),
    { collectionId: newId, cause: lastError }
  )
}

// Firestore caps a batch at 500 writes; in the atomic path one is the
// collection doc itself.
const MAX_BATCH_WRITES = 500
const MAX_RENAMED_ITEMS = MAX_BATCH_WRITES - 1

// `optionRenames` is a list of `{ fieldName, from, to }` dropdown option
// renames. Every item in the collection holding `from` for that field is
// rewritten to `to`. Up to 499 items are written in the same atomic batch as
// the field-definition update, so a failure leaves both unchanged; larger
// renames fall back to staged, retry-safe writes (see below).
export async function updateCollection(
  collectionId,
  { name, emoji, fieldDefs, optionRenames = [] }
) {
  const collectionRef = doc(db, 'collections', collectionId)
  if (optionRenames.length === 0) {
    return updateDoc(collectionRef, { name, emoji, fieldDefs })
  }

  const itemsSnap = await getDocs(
    query(collection(db, 'items'), where('collectionId', '==', collectionId))
  )
  const rewrites = []
  itemsSnap.forEach((itemSnap) => {
    const itemFields = itemSnap.data().fields ?? {}
    const changes = []
    // Group by field so a swap (A->B, B->A) is resolved against the old value once.
    const fieldNames = new Set(optionRenames.map((rename) => rename.fieldName))
    fieldNames.forEach((fieldName) => {
      const renames = optionRenames.filter((rename) => rename.fieldName === fieldName)
      const current = itemFields[fieldName]
      const next = applyOptionRenames(current, renames)
      if (next !== current) {
        changes.push([new FieldPath('fields', fieldName), next])
      }
    })
    if (changes.length > 0) {
      rewrites.push({ ref: itemSnap.ref, changes })
    }
  })

  if (rewrites.length <= MAX_RENAMED_ITEMS) {
    const batch = writeBatch(db)
    batch.update(collectionRef, { name, emoji, fieldDefs })
    rewrites.forEach(({ ref, changes }) => {
      batch.update(ref, ...changes.flat())
    })
    await batch.commit()
    return
  }

  // Too many items for one atomic batch, so write them in stages. Items go
  // first and the field definition last: if any stage fails the definition is
  // unchanged, the form still holds the old option text, and retrying the save
  // re-detects the rename (items already rewritten no longer match `from`, so
  // they are skipped). That only holds when no rename's `to` is another
  // rename's `from` in the same field (a swap or chain would re-rewrite
  // already-converted items on retry), so those are refused.
  const isChained = optionRenames.some((rename) =>
    optionRenames.some(
      (other) => other.fieldName === rename.fieldName && other.from === rename.to
    )
  )
  if (isChained) {
    throw new Error(
      'Swapping or chaining option renames on a collection this large is not supported; rename one option at a time.'
    )
  }
  for (let start = 0; start < rewrites.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(db)
    rewrites.slice(start, start + MAX_BATCH_WRITES).forEach(({ ref, changes }) => {
      batch.update(ref, ...changes.flat())
    })
    await batch.commit()
  }
  await updateDoc(collectionRef, { name, emoji, fieldDefs })
}

// Firestore does not cascade deletes to subcollections, so this removes the
// collection doc together with its members, invites and items. The writes are
// ordered so the collection doc and the owner's own member doc come last
// (rules authorize the earlier deletes via that membership); when everything
// fits in 500 writes it is one atomic batch, otherwise the final chunk still
// holds the owner member + collection doc so rules see them deleted together.
export async function deleteCollection(collectionId) {
  const collectionRef = doc(db, 'collections', collectionId)
  const [itemsSnap, invitesSnap, membersSnap] = await Promise.all([
    getDocs(query(collection(db, 'items'), where('collectionId', '==', collectionId))),
    getDocs(collection(db, 'collections', collectionId, 'invites')),
    getDocs(collection(db, 'collections', collectionId, 'members')),
  ])
  const memberDocs = membersSnap.docs
  const refs = [
    ...itemsSnap.docs.map((snap) => snap.ref),
    ...invitesSnap.docs.map((snap) => snap.ref),
    ...memberDocs.filter((snap) => snap.data().role !== 'owner').map((snap) => snap.ref),
    ...memberDocs.filter((snap) => snap.data().role === 'owner').map((snap) => snap.ref),
    collectionRef,
  ]
  for (let start = 0; start < refs.length; start += MAX_BATCH_WRITES) {
    const batch = writeBatch(db)
    refs.slice(start, start + MAX_BATCH_WRITES).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
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
  // When the membership snapshot came from the local cache (e.g. offline), read the
  // collection doc from the cache too rather than waiting on a server round trip that
  // fails offline. A doc that isn't cached is skipped instead of failing the whole list.
  async function readCollectionDoc(ref, fromCache) {
    if (fromCache) {
      try {
        return await getDocFromCache(ref)
      } catch {
        // Not cached; fall through to a normal read.
      }
    }
    try {
      return await getDoc(ref)
    } catch (err) {
      if (err?.code === 'unavailable') {
        return null
      }
      throw err
    }
  }

  const membershipsQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid))
  // Each snapshot resolves its collection docs asynchronously, so results can
  // finish out of order. Only the most recent snapshot's result may be applied.
  let latestSeq = 0
  const unsubscribe = onSnapshot(
    membershipsQuery,
    async (snapshot) => {
      const seq = ++latestSeq
      try {
        const entries = await Promise.all(
          snapshot.docs.map(async (memberSnap) => {
            const collectionSnap = await readCollectionDoc(
              memberSnap.ref.parent.parent,
              snapshot.metadata.fromCache
            )
            if (!collectionSnap?.exists()) {
              return null
            }
            return {
              id: collectionSnap.id,
              ...collectionSnap.data(),
              role: memberSnap.data().role,
            }
          })
        )
        if (seq !== latestSeq) return
        callback(entries.filter((entry) => entry != null))
      } catch (err) {
        if (seq !== latestSeq) return
        callback([], err)
      }
    },
    (error) => {
      latestSeq++
      callback([], error)
    }
  )
  return () => {
    latestSeq++
    unsubscribe()
  }
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
// snapshot, `members` is an array of `{ uid, role, email?, displayName?, joinedAt }`
// for every doc in `collections/{collectionId}/members` (uid comes from the
// doc ID, not a lookup). `email`/`displayName` are only present on member
// docs written after those fields were added -- older docs may omit them. On
// a listener error (e.g. `permission-denied`), `members` is `[]` and `error`
// is the Firestore error.
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

// Backfills `email`/`displayName` onto a `collections/{collectionId}/members/{uid}`
// doc written before those fields existed. firestore.rules only lets the
// owner update any members/{uid} doc (needed so an owner's own pre-existing
// member doc -- written back when createCollection didn't set these fields
// -- can be self-healed); a non-owner's stale doc can't be backfilled this
// way and only gets these fields once they leave and rejoin.
export function backfillMemberProfile(collectionId, uid, { email, displayName }) {
  return updateDoc(doc(db, 'collections', collectionId, 'members', uid), { email, displayName })
}

// Deletes a `collections/{collectionId}/members/{uid}` doc. Used both for an
// owner revoking another member's access and for a member leaving on their
// own -- firestore.rules' delete rule for this path already distinguishes
// the two cases (owner deleting someone else vs. a non-owner deleting their
// own doc) and rejects an owner trying to delete their own.
export function removeMember(collectionId, uid) {
  return deleteDoc(doc(db, 'collections', collectionId, 'members', uid))
}
