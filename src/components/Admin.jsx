import { useEffect, useState } from 'react'
import { CollectionForm } from './CollectionForm'
import {
  createCollection,
  deleteCollection,
  subscribeToCollection,
  updateCollection,
} from '../services/collections'
import './Admin.css'

const EMPTY_VALUES = { name: '', emoji: '', fieldDefs: [] }

export function Admin({ user, collectionId, onDone }) {
  const isEditMode = collectionId != null

  const [collection, setCollection] = useState(null)
  const [loading, setLoading] = useState(isEditMode)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isEditMode) {
      setCollection(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    const unsubscribe = subscribeToCollection(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setLoading(false)
        setLoadError('Could not load this collection. Please try again.')
        return
      }
      setCollection(data)
      setLoading(false)
    })
    return unsubscribe
  }, [collectionId, isEditMode])

  async function handleSubmit(values) {
    setError(null)
    setSubmitting(true)
    try {
      if (isEditMode) {
        await updateCollection(collectionId, values)
      } else {
        await createCollection(user, values)
      }
      onDone()
    } catch (err) {
      console.error(err)
      setError(
        isEditMode ? 'Could not save changes. Please try again.' : 'Could not create collection. Please try again.'
      )
      setSubmitting(false)
    }
  }

  async function handleConfirmDelete() {
    setError(null)
    setDeleting(true)
    try {
      await deleteCollection(collectionId)
      onDone()
    } catch (err) {
      console.error(err)
      setError('Could not delete collection. Please try again.')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  if (isEditMode && loading) {
    return (
      <div className="admin-screen">
        <p className="admin-loading">Loading collection…</p>
      </div>
    )
  }

  if (isEditMode && loadError) {
    return (
      <div className="admin-screen">
        <p className="admin-error">{loadError}</p>
        <button type="button" className="admin-back-button" onClick={onDone}>
          Back
        </button>
      </div>
    )
  }

  if (isEditMode && collection == null) {
    return (
      <div className="admin-screen">
        <p className="admin-error">This collection could not be found.</p>
        <button type="button" className="admin-back-button" onClick={onDone}>
          Back
        </button>
      </div>
    )
  }

  const initialValues = isEditMode
    ? { name: collection.name, emoji: collection.emoji, fieldDefs: collection.fieldDefs ?? [] }
    : EMPTY_VALUES

  return (
    <div className="admin-screen">
      <h2 className="admin-title">{isEditMode ? 'Edit collection' : 'New collection'}</h2>

      <CollectionForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        onCancel={onDone}
        submitLabel={isEditMode ? 'Save changes' : 'Create collection'}
        submitting={submitting}
      />

      {error && <p className="admin-error">{error}</p>}

      {isEditMode && (
        <div className="admin-danger-zone">
          {!confirmingDelete ? (
            <button
              type="button"
              className="admin-delete-button"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete collection
            </button>
          ) : (
            <div className="admin-delete-confirm">
              <p className="admin-delete-confirm-text">
                Are you sure? This can't be undone.
              </p>
              <div className="admin-delete-confirm-actions">
                <button
                  type="button"
                  className="admin-delete-confirm-button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button
                  type="button"
                  className="admin-delete-cancel-button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
