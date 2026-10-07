import { useEffect, useRef, useState } from 'react'
import { CollectionForm } from './CollectionForm'
import {
  archiveCollection,
  backfillMemberProfile,
  createCollection,
  deleteCollection,
  removeMember,
  restoreCollection,
  subscribeToCollection,
  subscribeToMembers,
  transferOwnership,
  updateCollection,
} from '../services/collections'
import { isConflictError } from '../services/conflicts'
import { createInvite } from '../services/invites'
import { changedCollectionParts, describeCollectionPart } from '../utils/editConflicts'
import { canWrite, getMemberRole, isViewerRole } from '../utils/permissions'
import { ReadOnlyBanner } from './ReadOnlyBanner'
import { BackButton } from './BackButton'
import { ConfirmDialog } from './ConfirmDialog'
import { memberDisplayName } from '../utils/memberDisplayName'
import { RemoveMemberDialog } from './RemoveMemberDialog'
import { Select } from './Select'
import { Spinner } from './Spinner'
import { StandardizeValues } from './StandardizeValues'
import { TransferOwnershipDialog } from './TransferOwnershipDialog'
import './Admin.css'

const EMPTY_VALUES = { name: '', emoji: '', fieldDefs: [] }
const INVITE_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

function collectionSnapshot(collection) {
  return {
    name: collection.name,
    emoji: collection.emoji,
    fieldDefs: collection.fieldDefs ?? [],
    updatedAt: collection.updatedAt ?? null,
  }
}

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
  const [archiving, setArchiving] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
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
  const [formDirty, setFormDirty] = useState(false)
  const [pendingDiscard, setPendingDiscard] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const [pendingTransfer, setPendingTransfer] = useState(null)
  // The collection as the edit form was opened with it. The form keeps editing this
  // snapshot while live updates arrive, and saves compare against it to detect
  // concurrent edits. `version` remounts the form when the editor loads the latest.
  const [base, setBase] = useState(null)
  // Set when a save was refused because someone else changed the same thing:
  // `{ conflictingKeys, values }`, where `values` is what the editor tried to save.
  const [conflict, setConflict] = useState(null)
  const currentBase = isEditMode && base?.id === collectionId ? base : null

  // Capture the base snapshot once the collection first loads (adjusted during
  // render, not in an effect, so the form never mounts without it).
  if (isEditMode && collection != null && currentBase === null) {
    setBase({ id: collectionId, version: 0, values: collectionSnapshot(collection) })
  }

  function guardedCancel() {
    if (!formDirty || submitting) {
      onCancel()
      return
    }
    setPendingDiscard(true)
  }

  function handleConfirmDiscard() {
    setPendingDiscard(false)
    onCancel()
  }

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

  async function handleSubmit(values, { force = false } = {}) {
    setError(null)
    setConflict(null)
    setSubmitting(true)
    try {
      if (isEditMode) {
        await updateCollection(collectionId, { ...values, original: currentBase.values, force })
      } else {
        await createCollection(user, values)
      }
      onSaved()
    } catch (err) {
      if (isConflictError(err) && err.reason === 'changed') {
        setConflict({ conflictingKeys: err.conflictingKeys, values })
        setSubmitting(false)
        return
      }
      console.error(err)
      setError(
        isEditMode ? 'Could not save changes. Please try again.' : 'Could not create collection. Please try again.'
      )
      setSubmitting(false)
    }
  }

  // Discards the editor's changes and reopens the form on the latest saved version.
  function handleLoadLatest() {
    setBase({ id: collectionId, version: currentBase.version + 1, values: collectionSnapshot(collection) })
    setConflict(null)
    setError(null)
  }

  function handleOverwrite() {
    handleSubmit(conflict.values, { force: true })
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

  function handleConfirmRemoval() {
    const member = pendingRemoval
    setPendingRemoval(null)
    handleRemoveMember(member.uid)
  }

  async function handleConfirmTransfer() {
    const member = pendingTransfer
    setPendingTransfer(null)
    setMemberActionError(null)
    setMemberBusyKey(member.uid)
    try {
      await transferOwnership(collectionId, user.uid, member.uid)
    } catch (err) {
      console.error(err)
      setMemberActionError('Could not transfer ownership. Please try again.')
    } finally {
      setMemberBusyKey(null)
    }
  }

  // Archives (then goes home) or, for an already archived collection, restores it
  // and stays put; the live collection subscription flips the button back.
  async function handleArchiveToggle() {
    const restoring = Boolean(collection.archivedAt)
    setError(null)
    setArchiving(true)
    try {
      if (restoring) {
        await restoreCollection(collectionId)
      } else {
        await archiveCollection(collectionId)
        onDone()
      }
    } catch (err) {
      console.error(err)
      setError(
        restoring
          ? 'Could not restore collection. Please try again.'
          : 'Could not archive collection. Please try again.'
      )
    } finally {
      setArchiving(false)
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
        <BackButton onClick={guardedCancel} />
      </div>
    )
  }

  if (isEditMode && collection == null) {
    return (
      <div>
        <p className="not-found-message">This collection could not be found.</p>
        <BackButton onClick={guardedCancel} />
      </div>
    )
  }

  const initialValues = isEditMode ? currentBase?.values ?? collectionSnapshot(collection) : EMPTY_VALUES
  // Someone else saved a change to this collection since the form was opened.
  const changedByOthers =
    isEditMode &&
    currentBase !== null &&
    !submitting &&
    changedCollectionParts(currentBase.values, collection).length > 0

  const isOwner = isEditMode && collection.ownerId === user.uid
  const rolesLoaded = members !== null
  const myRole = getMemberRole(members, user.uid)
  const isViewer = isEditMode && rolesLoaded && isViewerRole(myRole)
  // Archived collections are read-only for everyone until the owner restores them.
  const isArchived = isEditMode && Boolean(collection.archivedAt)
  const showWriteControls = rolesLoaded && canWrite(myRole) && !isArchived

  return (
    <div className="admin-screen">
      <div className="admin-title-row sticky-panel">
        <h2 className="admin-title">{isEditMode ? 'Edit collection' : 'New collection'}</h2>
        <div className="admin-title-actions" ref={setActionsSlot} />
      </div>
      {isArchived ? (
        <ReadOnlyBanner message="Archived — this collection is read-only until the owner restores it." />
      ) : (
        isViewer && <ReadOnlyBanner />
      )}

      {showWriteControls && (conflict || changedByOthers) && (
        <div className="admin-conflict" role={conflict ? 'alert' : 'status'}>
          {conflict ? (
            <p>
              Someone else changed this collection&apos;s{' '}
              {conflict.conflictingKeys.map(describeCollectionPart).join(' and ')} while you were
              editing, so your changes were not saved. Load the latest version (your changes are
              discarded) or overwrite it with yours.
            </p>
          ) : (
            <p>
              Someone else changed this collection while you were editing. Saving keeps their changes
              unless you changed the same thing.
            </p>
          )}
          <details className="admin-conflict-review">
            <summary>Review latest version</summary>
            <p className="admin-readonly-summary-name">
              {collection.emoji ? `${collection.emoji} ` : ''}
              {collection.name}
            </p>
            <ul className="admin-readonly-summary-fields">
              {(collection.fieldDefs ?? []).map((fieldDef) => (
                <li key={fieldDef.name}>
                  {fieldDef.name} ({fieldDef.type})
                  {fieldDef.type === 'dropdown' && fieldDef.options?.length > 0 &&
                    `: ${fieldDef.options.join(', ')}`}
                </li>
              ))}
            </ul>
          </details>
          <div className="admin-conflict-actions">
            <button
              type="button"
              className="admin-conflict-button"
              onClick={handleLoadLatest}
              disabled={submitting}
            >
              {formDirty ? 'Discard mine and load latest' : 'Load latest'}
            </button>
            {conflict && (
              <button
                type="button"
                className="admin-conflict-button"
                onClick={handleOverwrite}
                disabled={submitting}
              >
                Overwrite with mine
              </button>
            )}
          </div>
        </div>
      )}

      {!isEditMode || showWriteControls ? (
        <CollectionForm
          key={currentBase ? `${collectionId}-${currentBase.version}` : 'new'}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={guardedCancel}
          onDirtyChange={setFormDirty}
          submitLabel={isEditMode ? 'Save changes' : 'Create collection'}
          submittingLabel={isEditMode ? 'Saving…' : 'Creating…'}
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
          <BackButton onClick={guardedCancel} />
        </div>
      )}

      {pendingDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have unsaved changes to this collection. Discard them?"
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={handleConfirmDiscard}
          onCancel={() => setPendingDiscard(false)}
        />
      )}

      {pendingRemoval && (
        <RemoveMemberDialog
          member={pendingRemoval}
          isSelf={pendingRemoval.uid === user.uid}
          onConfirm={handleConfirmRemoval}
          onCancel={() => setPendingRemoval(null)}
        />
      )}

      {confirmingArchive && (
        <ConfirmDialog
          title="Archive this collection?"
          message="Archiving tucks this collection away without deleting anything. It disappears from the home screen for you and every member you've shared it with, and all items and members are kept. Members can still open it from Archived collections, but only you can restore it."
          confirmLabel="Archive"
          cancelLabel="Cancel"
          onConfirm={() => {
            setConfirmingArchive(false)
            handleArchiveToggle()
          }}
          onCancel={() => setConfirmingArchive(false)}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this collection?"
          message="This permanently deletes the collection along with all of its items, members and pending invites. Everyone you've shared it with loses access. This can't be undone. If you just want it out of the way, archive it instead."
          acknowledgement="I understand this can't be undone"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => {
            setConfirmingDelete(false)
            handleConfirmDelete()
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {pendingTransfer && (
        <TransferOwnershipDialog
          member={pendingTransfer}
          onConfirm={handleConfirmTransfer}
          onCancel={() => setPendingTransfer(null)}
        />
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
                        {memberDisplayName(member)}
                      </span>
                      <span className="admin-member-role">{member.role}</span>
                    </div>
                    {(canRevoke || canLeave) && (
                      <div className="admin-member-actions">
                        {canRevoke && member.role !== 'owner' && (
                          <button
                            type="button"
                            className="admin-member-transfer-button"
                            onClick={() => setPendingTransfer(member)}
                            disabled={busy}
                          >
                            Transfer ownership
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-member-action-button"
                          onClick={() => setPendingRemoval(member)}
                          disabled={busy}
                        >
                          {busy ? 'Working…' : canLeave ? 'Leave' : 'Revoke'}
                        </button>
                      </div>
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
          <button
            type="button"
            className="admin-archive-button"
            onClick={collection.archivedAt ? handleArchiveToggle : () => setConfirmingArchive(true)}
            disabled={archiving || deleting}
          >
            {archiving
              ? collection.archivedAt ? 'Restoring…' : 'Archiving…'
              : collection.archivedAt ? 'Restore collection' : 'Archive collection'}
          </button>
          <button
            type="button"
            className="admin-delete-button"
            onClick={() => setConfirmingDelete(true)}
            disabled={archiving || deleting}
          >
            {deleting ? 'Deleting…' : 'Delete collection'}
          </button>
        </div>
      )}
    </div>
  )
}
