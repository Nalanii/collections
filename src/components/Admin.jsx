import { useEffect, useRef, useState } from 'react'
import { CollectionForm } from './CollectionForm'
import {
  backfillMemberProfile,
  createCollection,
  deleteCollection,
  removeMember,
  subscribeToCollection,
  subscribeToMembers,
  updateCollection,
} from '../services/collections'
import { createInvite } from '../services/invites'
import { canWrite, getMemberRole, isViewerRole } from '../utils/permissions'
import { ReadOnlyBanner } from './ReadOnlyBanner'
import { BackButton } from './BackButton'
import { Select } from './Select'
import { Spinner } from './Spinner'
import { StandardizeValues } from './StandardizeValues'
import './Admin.css'

const EMPTY_VALUES = { name: '', emoji: '', fieldDefs: [] }
const INVITE_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

export function Admin({ user, collectionId, onDone, onCancel = onDone, onSaved = onDone }) {
  const isEditMode = collectionId != null

  // Load results are tagged with the collection id they belong to, so results for a
  // previous collection (or for create mode) read as "still loading".
  const [loadState, setLoadState] = useState({ id: null, data: null, error: null })
  const [error, setError] = useState(null)
  const currentLoad = isEditMode && loadState.id === collectionId ? loadState : null
  const collection = currentLoad?.data ?? null
  const loading = isEditMode && currentLoad === null
  const loadError = currentLoad?.error ?? null
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // DOM slot in the sticky title row where CollectionForm portals its Save/Cancel buttons.
  const [actionsSlot, setActionsSlot] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteError, setInviteError] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(null)
  const [inviting, setInviting] = useState(false)
  const [membersData, setMembersData] = useState(null)
  const members = isEditMode ? membersData : null
  const [membersError, setMembersError] = useState(null)
  const [memberBusyKey, setMemberBusyKey] = useState(null)
  const [memberActionError, setMemberActionError] = useState(null)
  const backfilledOwnProfileRef = useRef(false)

  useEffect(() => {
    if (!isEditMode) {
      return
    }

    const unsubscribe = subscribeToCollection(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setLoadState((prev) => ({
          id: collectionId,
          data: prev.id === collectionId ? prev.data : null,
          error: 'Could not load this collection. Please try again.',
        }))
        return
      }
      setLoadState((prev) => ({
        id: collectionId,
        data,
        error: prev.id === collectionId ? prev.error : null,
      }))
    })
    return unsubscribe
  }, [collectionId, isEditMode])

  useEffect(() => {
    if (!isEditMode) {
      return
    }
    const unsubscribe = subscribeToMembers(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setMembersError('Could not load members.')
        setMembersData(data)
        return
      }
      setMembersData(data)
    })
    return unsubscribe
  }, [collectionId, isEditMode])

  useEffect(() => {
    if (!isEditMode || collection?.ownerId !== user.uid || members == null || backfilledOwnProfileRef.current) {
      return
    }
    const ownMember = members.find((member) => member.uid === user.uid)
    if (ownMember == null) return
    if (ownMember.email === user.email && ownMember.displayName === user.displayName) return

    backfilledOwnProfileRef.current = true
    backfillMemberProfile(collectionId, user.uid, { email: user.email, displayName: user.displayName }).catch(
      (err) => {
        console.error(err)
        backfilledOwnProfileRef.current = false
      }
    )
  }, [isEditMode, collection, members, collectionId, user.uid, user.email, user.displayName])

  async function handleSubmit(values) {
    setError(null)
    setSubmitting(true)
    try {
      if (isEditMode) {
        await updateCollection(collectionId, values)
      } else {
        await createCollection(user, values)
      }
      onSaved()
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

  async function handleRemoveMember(uid) {
    const isSelf = uid === user.uid
    setMemberActionError(null)
    setMemberBusyKey(uid)
    try {
      await removeMember(collectionId, uid)
      if (isSelf) {
        onDone()
        return
      }
    } catch (err) {
      console.error(err)
      setMemberActionError('Could not update membership. Please try again.')
    } finally {
      setMemberBusyKey(null)
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
        <Spinner label="Loading collection" />
      </div>
    )
  }

  if (isEditMode && members === null) {
    return (
      <div className="admin-screen">
        <Spinner label="Loading collection" />
      </div>
    )
  }

  if (isEditMode && loadError) {
    return (
      <div>
        <p className="not-found-message">{loadError}</p>
        <BackButton onClick={onCancel} />
      </div>
    )
  }

  if (isEditMode && collection == null) {
    return (
      <div>
        <p className="not-found-message">This collection could not be found.</p>
        <BackButton onClick={onCancel} />
      </div>
    )
  }

  const initialValues = isEditMode
    ? { name: collection.name, emoji: collection.emoji, fieldDefs: collection.fieldDefs ?? [] }
    : EMPTY_VALUES

  const isOwner = isEditMode && collection.ownerId === user.uid
  const rolesLoaded = members !== null
  const myRole = getMemberRole(members, user.uid)
  const isViewer = isEditMode && rolesLoaded && isViewerRole(myRole)
  const showWriteControls = rolesLoaded && canWrite(myRole)

  return (
    <div className="admin-screen">
      <div className="admin-title-row">
        <h2 className="admin-title">{isEditMode ? 'Edit collection' : 'New collection'}</h2>
        <div className="admin-title-actions" ref={setActionsSlot} />
      </div>
      {isViewer && <ReadOnlyBanner />}

      {!isEditMode || showWriteControls ? (
        <CollectionForm
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={onCancel}
          submitLabel={isEditMode ? 'Save changes' : 'Create collection'}
          submitting={submitting}
          actionsContainer={actionsSlot}
        />
      ) : (
        <div className="admin-readonly-summary">
          <p className="admin-readonly-summary-name">
            {initialValues.emoji ? `${initialValues.emoji} ` : ''}
            {initialValues.name}
          </p>
          <ul className="admin-readonly-summary-fields">
            {initialValues.fieldDefs.map((fieldDef) => (
              <li key={fieldDef.name}>
                {fieldDef.name} ({fieldDef.type})
              </li>
            ))}
          </ul>
          <BackButton onClick={onCancel} />
        </div>
      )}

      {error && <p className="admin-error">{error}</p>}

      {isEditMode && showWriteControls && (
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
            <Select
              className="admin-invite-role-select"
              options={INVITE_ROLES}
              value={inviteRole}
              onChange={setInviteRole}
              ariaLabel="Invite role"
            />
            <button type="submit" className="admin-invite-submit-button" disabled={inviting}>
              {inviting ? 'Sending…' : 'Invite'}
            </button>
          </form>
          {inviteError && <p className="admin-error">{inviteError}</p>}
          {inviteSuccess && <p className="admin-invite-success">{inviteSuccess}</p>}
        </div>
      )}

      {isEditMode && (
        <div className="admin-members-zone">
          <h3 className="admin-section-title">Members</h3>
          {membersError && <p className="admin-error">{membersError}</p>}
          {memberActionError && <p className="admin-error">{memberActionError}</p>}
          {members == null ? (
            <Spinner label="Loading members" />
          ) : (
            <ul className="admin-members-list">
              {members.map((member) => {
                const isSelf = member.uid === user.uid
                const canRevoke = isOwner && !isSelf
                const canLeave = isSelf && member.role !== 'owner'
                const busy = memberBusyKey === member.uid
                return (
                  <li className="admin-member-card" key={member.uid}>
                    <div className="admin-member-details">
                      <span className="admin-member-email">
                        {member.displayName ?? member.email ?? member.uid}
                      </span>
                      <span className="admin-member-role">{member.role}</span>
                    </div>
                    {(canRevoke || canLeave) && (
                      <button
                        type="button"
                        className="admin-member-action-button"
                        onClick={() => handleRemoveMember(member.uid)}
                        disabled={busy}
                      >
                        {busy ? 'Working…' : canLeave ? 'Leave' : 'Revoke'}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {isEditMode && showWriteControls && (
        <StandardizeValues collectionId={collectionId} fieldDefs={collection.fieldDefs} />
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
