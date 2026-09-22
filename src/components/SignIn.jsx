import { useRef, useState } from 'react'
import { signInWithGoogle } from '../services/auth'
import logo from '../assets/logo.png'
import { DecorBackground } from './DecorBackground'
import { Header } from './Header'
import './SignIn.css'

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

export function SignIn() {
  const [error, setError] = useState(null)
  const [signingIn, setSigningIn] = useState(false)
  const hostRef = useRef(null)
  const contentRef = useRef(null)

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
    <>
      <Header
        action={
          <button
            type="button"
            className="header-action-button"
            onClick={handleSignIn}
            disabled={signingIn}
          >
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        }
      />
      <div className="sign-in-screen decor-host" ref={hostRef}>
        <div className="sign-in-content" ref={contentRef}>
          <img className="sign-in-hero" src={logo} alt="" width="512" height="512" />
          <p className="sign-in-subtitle">
            Track what you have and what you're hunting for
          </p>
          <button
            type="button"
            className="sign-in-cta"
            onClick={handleSignIn}
            disabled={signingIn}
          >
            <GoogleIcon />
            {signingIn ? 'Signing in…' : 'Sign in with Google'}
          </button>
          {error && <p className="sign-in-error">{error}</p>}
        </div>
        <DecorBackground hostRef={hostRef} contentRef={contentRef} />
      </div>
    </>
  )
}
