import { useEffect, useState } from 'react'
import { restoreCollection, subscribeToUserCollections } from '../services/collections'
import { BackButton } from './BackButton'
import { Spinner } from './Spinner'
import './Home.css'
import './ArchivedCollections.css'

export function ArchivedCollections({ user, onBack, onOpenCollection = () => {} }) {
  const [collections, setCollections] = useState(null)
  // The error is tagged with the uid it belongs to, so it clears when the user changes.
  const [errorState, setErrorState] = useState({ uid: null, message: null })
  const error = errorState.uid === user.uid ? errorState.message : null
  const [restoringId, setRestoringId] = useState(null)
  const [restoreError, setRestoreError] = useState({ id: null, message: null })

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

  async function handleRestore(collectionId) {
    setRestoreError({ id: null, message: null })
    setRestoringId(collectionId)
    try {
      await restoreCollection(collectionId)
      // The list subscription only re-emits on membership changes, not on edits to
      // the collection doc itself, so reflect the restore locally.
      setCollections((prev) =>
        prev?.map((c) => (c.id === collectionId ? { ...c, archivedAt: null } : c)) ?? prev
      )
    } catch (err) {
      console.error(err)
      setRestoreError({ id: collectionId, message: 'Could not restore collection. Please try again.' })
    } finally {
      setRestoringId(null)
    }
  }

  const loading = collections === null && !error
  const archived = collections?.filter((c) => c.archivedAt) ?? []

  return (
    <div className="archived-screen">
      <BackButton onClick={onBack} />
      <h2 className="archived-title">Archived collections</h2>

      {loading && <Spinner label="Loading collections" />}

      {error && <p className="home-error">{error}</p>}

      {!loading && !error && archived.length === 0 && (
        <div className="home-empty">
          <p className="home-empty-title">No archived collections</p>
        </div>
      )}

      {!loading && !error && archived.length > 0 && (
        <div className="home-grid">
          {archived.map((c) => (
            <div
              key={c.id}
              className="collection-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenCollection(c.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenCollection(c.id)
                }
              }}
            >
              {c.emoji && <span className="collection-card-emoji">{c.emoji}</span>}
              <span className="collection-card-name">{c.name}</span>
              {c.ownerId !== user.uid && (
                <span className="collection-card-badge collection-card-badge--shared">
                  Shared with me
                </span>
              )}
              {c.ownerId === user.uid && (
                <button
                  type="button"
                  className="archived-restore-button"
                  disabled={restoringId === c.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleRestore(c.id)
                  }}
                >
                  {restoringId === c.id ? 'Restoring…' : 'Restore'}
                </button>
              )}
              {restoreError.id === c.id && <p className="archived-error">{restoreError.message}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
