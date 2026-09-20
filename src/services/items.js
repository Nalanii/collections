import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase'

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
