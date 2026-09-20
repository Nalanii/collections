import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const googleProvider = new GoogleAuthProvider()

export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(auth, callback)
}

export async function signInWithGoogle() {
  const { user } = await signInWithPopup(auth, googleProvider)
  await ensureUserProfile(user)
  return user
}

export function signOutUser() {
  return signOut(auth)
}

export async function ensureUserProfile(user) {
  const userRef = doc(db, 'users', user.uid)
  const snapshot = await getDoc(userRef)
  if (snapshot.exists()) return

  await setDoc(userRef, {
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    createdAt: serverTimestamp(),
  })
}
