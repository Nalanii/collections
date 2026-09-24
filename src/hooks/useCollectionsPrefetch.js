import { useEffect } from 'react'
import { subscribeToCollection, subscribeToMembers } from '../services/collections'
import { subscribeToItems } from '../services/items'

const noop = () => {}

// Keeps a live listener open on the doc, members and items of every given collection so
// Firestore's persistent cache holds them all, making each collection searchable offline
// even if it was never opened on this device. Results are discarded; only the cache
// side effect matters.
export function useCollectionsPrefetch(collectionIds) {
  const key = collectionIds ? [...collectionIds].sort().join('|') : ''

  useEffect(() => {
    if (!key) {
      return undefined
    }
    const unsubscribes = key.split('|').flatMap((id) => [
      subscribeToCollection(id, noop),
      subscribeToMembers(id, noop),
      subscribeToItems(id, noop),
    ])
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [key])
}
