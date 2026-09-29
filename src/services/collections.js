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
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { changedCollectionParts, findCollectionConflicts, sameTimestamp } from '../utils/editConflicts'
import { applyOptionRenames } from '../utils/fieldOptions'
import { ConflictError } from './conflicts'
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
    // Compared by updateCollection to detect concurrent edits.
    updatedAt: serverTimestamp(),
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

// Firestore caps a batch/transaction at 500 writes; in the atomic path one is
// the collection doc itself.
const MAX_BATCH_WRITES = 500
const MAX_RENAMED_ITEMS = MAX_BATCH_WRITES - 1

// The `[FieldPath, newValue]` writes that replay `optionRenames` on one item's
// `fields` (empty when none of its values are renamed).
function optionRenameChanges(itemFields, optionRenames) {
  const fields = itemFields ?? {}
  const changes = []
  // Group by field so a swap (A->B, B->A) is resolved against the old value once.
  const fieldNames = new Set(optionRenames.map((rename) => rename.fieldName))
  fieldNames.forEach((fieldName) => {
    const renames = optionRenames.filter((rename) => rename.fieldName === fieldName)
    const current = fields[fieldName]
    const next = applyOptionRenames(current, renames)
    if (next !== current) {
      changes.push([new FieldPath('fields', fieldName), next])
    }
  })
  return changes
}

// Rewrites one item read inside `transaction`. The rename is recomputed from the
// transaction's fresh read (not the earlier query), and the transaction fails and
// retries if the item changes before commit, so an item edited after the rename
// began is never overwritten with a stale value. `updatedAt` is bumped so an editor
// with the item open sees the change and gets a conflict if they changed the same field.
function renameItemInTransaction(transaction, itemSnap, optionRenames) {
  if (!itemSnap.exists()) {
    return
  }
  const changes = optionRenameChanges(itemSnap.data().fields, optionRenames)
  if (changes.length > 0) {
    transaction.update(itemSnap.ref, ...changes.flat(), 'updatedAt', serverTimestamp())
  }
}

// `original` is the collection as the edit form was opened with it (`{ name,
// emoji, fieldDefs, updatedAt }`). Only the parts (name / emoji / fieldDefs) that
// differ from it are written, together with a new `updatedAt`. Each write re-reads
// the collection doc in a transaction: if its `updatedAt` moved on and someone else
// also changed one of the same parts to something different, a ConflictError is
// thrown and nothing is written. `force` skips that check (the editor chose to
// overwrite). Needs a connection; transactions can't run offline.
//
// `optionRenames` is a list of `{ fieldName, from, to }` dropdown option
// renames. Every item in the collection holding `from` for that field is
// rewritten to `to`. Up to 499 items are written in the same transaction as the
// field-definition update, so a conflict or failure leaves both unchanged;
// larger renames fall back to staged, retry-safe transactions (see below).
export async function updateCollection(
  collectionId,
  { name, emoji, fieldDefs, optionRenames = [], original, force = false }
) {
  const collectionRef = doc(db, 'collections', collectionId)
  const edited = { name, emoji, fieldDefs }
  const changedParts = changedCollectionParts(original, edited)
  if (changedParts.length === 0 && optionRenames.length === 0) {
    return
  }
  const collectionUpdate = {
    ...Object.fromEntries(changedParts.map((part) => [part, edited[part]])),
    updatedAt: serverTimestamp(),
  }

  async function checkForConflict(transaction) {
    const snap = await transaction.get(collectionRef)
    if (!snap.exists()) {
      throw new ConflictError({ reason: 'deleted' })
    }
    const current = snap.data()
    if (force || sameTimestamp(current.updatedAt, original?.updatedAt)) {
      return
    }
    const conflictingKeys = findCollectionConflicts(changedParts, original, edited, current)
    if (conflictingKeys.length > 0) {
      throw new ConflictError({ reason: 'changed', latest: { id: snap.id, ...current }, conflictingKeys })
    }
  }

  if (optionRenames.length === 0) {
    await runTransaction(db, async (transaction) => {
      await checkForConflict(transaction)
      transaction.update(collectionRef, collectionUpdate)
    })
    return
  }

  // Client transactions can't run queries, so find the affected items first and
  // re-read each one inside the transaction that rewrites it.
  const itemsSnap = await getDocs(
    query(collection(db, 'items'), where('collectionId', '==', collectionId))
  )
  const renamedItemRefs = itemsSnap.docs
    .filter((itemSnap) => optionRenameChanges(itemSnap.data().fields, optionRenames).length > 0)
    .map((itemSnap) => itemSnap.ref)

  if (renamedItemRefs.length <= MAX_RENAMED_ITEMS) {
    await runTransaction(db, async (transaction) => {
      await checkForConflict(transaction)
      // All reads must happen before any write in a transaction.
      const itemSnaps = await Promise.all(renamedItemRefs.map((ref) => transaction.get(ref)))
      transaction.update(collectionRef, collectionUpdate)
      itemSnaps.forEach((itemSnap) => renameItemInTransaction(transaction, itemSnap, optionRenames))
    })
    return
  }

  // Too many items for one transaction, so write them in stages. Items go
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
  // Refuse up front if the definition already conflicts, before touching any item;
  // the final write checks again in case it changes while the items are written.
  await runTransaction(db, checkForConflict)
  for (let start = 0; start < renamedItemRefs.length; start += MAX_BATCH_WRITES) {
    const chunk = renamedItemRefs.slice(start, start + MAX_BATCH_WRITES)
    await runTransaction(db, async (transaction) => {
      const itemSnaps = await Promise.all(chunk.map((ref) => transaction.get(ref)))
      itemSnaps.forEach((itemSnap) => renameItemInTransaction(transaction, itemSnap, optionRenames))
    })
  }
  await runTransaction(db, async (transaction) => {
    await checkForConflict(transaction)
    transaction.update(collectionRef, collectionUpdate)
  })
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
// every collection the user is a member of, and `error` is undefined. Owned
// collections also get `memberCount` (everyone with access, owner included)
// once it has loaded, which updates the list again as members join or leave.
// Member docs are matched on their own `uid` field (not the doc ID) because a
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

  // Member counts for the collections this user owns. The collectionGroup query
  // above only matches the user's own membership docs, so a count needs a
  // listener on each owned collection's members subcollection (any member may
  // read it under firestore.rules). A collection whose count listener fails, or
  // hasn't reported yet, simply has no `memberCount`.
  const memberListeners = new Map()
  const memberCounts = new Map()
  let entries = []

  function emit() {
    callback(
      entries.map((entry) =>
        memberCounts.has(entry.id) ? { ...entry, memberCount: memberCounts.get(entry.id) } : entry
      )
    )
  }

  function syncMemberListeners() {
    const ownedIds = new Set(entries.filter((entry) => entry.ownerId === uid).map((entry) => entry.id))
    memberListeners.forEach((stop, id) => {
      if (!ownedIds.has(id)) {
        stop()
        memberListeners.delete(id)
        memberCounts.delete(id)
      }
    })
    ownedIds.forEach((id) => {
      if (memberListeners.has(id)) return
      memberListeners.set(
        id,
        onSnapshot(
          collection(db, 'collections', id, 'members'),
          (membersSnap) => {
            memberCounts.set(id, membersSnap.size)
            emit()
          },
          () => {
            // Drop this card's count (and the dead listener) rather than failing the list.
            memberListeners.delete(id)
            memberCounts.delete(id)
            emit()
          }
        )
      )
    })
  }

  function stopMemberListeners() {
    memberListeners.forEach((stop) => stop())
    memberListeners.clear()
    memberCounts.clear()
    entries = []
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
        const resolved = await Promise.all(
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
        entries = resolved.filter((entry) => entry != null)
        syncMemberListeners()
        emit()
      } catch (err) {
        if (seq !== latestSeq) return
        // Stop the count listeners so a late count can't replace the error state.
        stopMemberListeners()
        callback([], err)
      }
    },
    (error) => {
      latestSeq++
      stopMemberListeners()
      callback([], error)
    }
  )
  return () => {
    latestSeq++
    unsubscribe()
    stopMemberListeners()
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
