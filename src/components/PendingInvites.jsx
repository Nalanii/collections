import { useEffect, useState } from 'react'
import { acceptInvite, declineInvite, subscribeToUserInvites } from '../services/invites'
import './PendingInvites.css'

export function PendingInvites({ user }) {
  const [invites, setInvites] = useState(null)
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState(null)

  const visibleInvites = user.email ? invites : []

  useEffect(() => {
    if (!user.email) {
      return
    }
    const unsubscribe = subscribeToUserInvites(user.email, (data, err) => {
      if (err) {
        console.error(err)
        setError('Could not load pending invites.')
        return
      }
      setInvites(data)
    })
    return unsubscribe
  }, [user.email])

  if (!visibleInvites || visibleInvites.length === 0) {
    return null
  }

  async function handleAccept(invite) {
    const key = `${invite.collectionId}:accept`
    setError(null)
    setBusyKey(key)
    try {
      await acceptInvite(user, invite.collectionId, invite.role, invite.email)
    } catch (err) {
      console.error(err)
      setError('Could not accept invite. Please try again.')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleDecline(invite) {
    const key = `${invite.collectionId}:decline`
    setError(null)
    setBusyKey(key)
    try {
      await declineInvite(invite.collectionId, invite.email)
    } catch (err) {
      console.error(err)
      setError('Could not decline invite. Please try again.')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="pending-invites">
      <h2 className="pending-invites-title">Pending invites</h2>
      {error && <p className="pending-invites-error">{error}</p>}
      <ul className="pending-invites-list">
        {visibleInvites.map((invite) => {
          const acceptKey = `${invite.collectionId}:accept`
          const declineKey = `${invite.collectionId}:decline`
          const busy = busyKey === acceptKey || busyKey === declineKey
          return (
            <li className="pending-invite-card" key={invite.collectionId}>
              <span className="pending-invite-emoji">{invite.collectionEmoji}</span>
              <div className="pending-invite-details">
                <span className="pending-invite-name">{invite.collectionName}</span>
                <span className="pending-invite-role">Invited as {invite.role}</span>
              </div>
              <div className="pending-invite-actions">
                <button
                  type="button"
                  className="pending-invite-accept-button"
                  onClick={() => handleAccept(invite)}
                  disabled={busy}
                >
                  {busyKey === acceptKey ? 'Accepting…' : 'Accept'}
                </button>
                <button
                  type="button"
                  className="pending-invite-decline-button"
                  onClick={() => handleDecline(invite)}
                  disabled={busy}
                >
                  {busyKey === declineKey ? 'Declining…' : 'Decline'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
