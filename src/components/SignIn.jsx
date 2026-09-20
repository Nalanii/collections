import { useState } from 'react'
import { signInWithGoogle } from '../services/auth'
import './SignIn.css'

export function SignIn() {
  const [error, setError] = useState(null)
  const [signingIn, setSigningIn] = useState(false)

  async function handleSignIn() {
    setError(null)
    setSigningIn(true)
    try {
      await signInWithGoogle()
    } catch {
      setError('Sign-in failed. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="sign-in-screen">
      <h1 className="sign-in-title">Thrift Collections</h1>
      <p className="sign-in-subtitle">
        Track what you have and what you're hunting for.
      </p>
      <button
        type="button"
        className="sign-in-button"
        onClick={handleSignIn}
        disabled={signingIn}
      >
        {signingIn ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {error && <p className="sign-in-error">{error}</p>}
    </div>
  )
}
