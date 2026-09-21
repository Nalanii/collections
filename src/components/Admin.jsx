import { useEffect, useState } from 'react'
import { CollectionForm } from './CollectionForm'
import {
  createCollection,
  deleteCollection,
  subscribeToCollection,
  updateCollection,
} from '../services/collections'
import { createInvite } from '../services/invites'
import './Admin.css'

const EMPTY_VALUES = { name: '', emoji: '', fieldDefs: [] }
const INVITE_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

export function Admin({ user, collectionId, onDone }) {
  const isEditMode = collectionId != null

  const [collection, setCollection] = useState(null)
  const [loading, setLoading] = useState(isEditMode)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteError, setInviteError] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(null)
  const [inviting, setInviting] = useState(false)

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

  async function handleInviteSubmit(event) {
    event.preventDefault()
    const trimmedEmail = inviteEmail.trim()
    if (trimmedEmail === '') {
      return
    }
    setInviteError(null)
    setInviteSuccess(null)
    setInviting(true)
    try {
      await createInvite(user.uid, collectionId, trimmedEmail, inviteRole)
      setInviteSuccess(`Invite sent to ${trimmedEmail}.`)
      setInviteEmail('')
      setInviteRole('editor')
    } catch (err) {
      console.error(err)
      setInviteError('Could not send invite. Please try again.')
    } finally {
      setInviting(false)
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

  const isOwner = isEditMode && collection.ownerId === user.uid

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
        <div className="admin-invite-zone">
          <h3 className="admin-section-title">Invite someone</h3>
          <form className="admin-invite-form" onSubmit={handleInviteSubmit}>
            <input
              type="email"
              className="admin-invite-email-input"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="email@example.com"
              aria-label="Invite email"
              required
            />
            <select
              className="admin-invite-role-select"
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
              aria-label="Invite role"
            >
              {INVITE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <button type="submit" className="admin-invite-submit-button" disabled={inviting}>
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </form>
          {inviteError && <p className="admin-error">{inviteError}</p>}
          {inviteSuccess && <p className="admin-invite-success">{inviteSuccess}</p>}
        </div>
      )}

      {isOwner && (
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
