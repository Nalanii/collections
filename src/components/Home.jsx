import { useEffect, useState } from 'react'
import { subscribeToUserCollections } from '../services/collections'
import { PendingInvites } from './PendingInvites'
import './Home.css'

export function Home({ user, onCreateCollection, onOpenCollection = () => {} }) {
  const [collections, setCollections] = useState(null)
  // The error is tagged with the uid it belongs to, so it clears when the user changes.
  const [errorState, setErrorState] = useState({ uid: null, message: null })
  const error = errorState.uid === user.uid ? errorState.message : null

  useEffect(() => {
    const unsubscribe = subscribeToUserCollections(user.uid, (data, err) => {
      if (err) {
        console.error(err)
        setErrorState({ uid: user.uid, message: 'Could not load your collections. Please try again.' })
        return
      }
      setCollections(data)
    })
    return unsubscribe
  }, [user.uid])

  const loading = collections === null && !error

  return (
    <div className="home-screen">
      <PendingInvites user={user} />

      {loading && <p className="home-loading">Loading your collections…</p>}

      {error && <p className="home-error">{error}</p>}

      {!loading && !error && collections.length === 0 && (
        <div className="home-empty">
          <p className="home-empty-title">No collections yet</p>
          <p className="home-empty-text">
            Create your first collection to start tracking what you have and what you want.
          </p>
        </div>
      )}

      {!loading && !error && collections.length > 0 && (
        <div className="home-grid">
          {collections.map((c) => (
            <div
              key={c.id}
              className="collection-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenCollection(c.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenCollection(c.id)
                }
              }}
            >
              <span className="collection-card-emoji">{c.emoji}</span>
              <span className="collection-card-name">{c.name}</span>
              {c.ownerId !== user.uid && (
                <span className="collection-card-badge collection-card-badge--shared">
                  Shared with me
                </span>
              )}
              {c.role === 'viewer' && (
                <span className="collection-card-badge collection-card-badge--readonly">
                  Read-only
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="home-fab"
        onClick={onCreateCollection}
        aria-label="Create a new collection"
      >
        <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
          <path
            d="M8 2v12M2 8h12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
