import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  disableNetwork,
  enableNetwork,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// Persistent cache keeps previously loaded collections/items readable offline and
// queues writes until connectivity returns.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

// Firestore retries a dropped connection with backoff, so after being offline it can
// take a while to reconnect. Recycle the network connection as soon as the browser
// reports it's back online so listeners refresh and queued writes flush right away.
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    try {
      await disableNetwork(db)
      await enableNetwork(db)
    } catch (err) {
      console.error(err)
    }
  })
}
