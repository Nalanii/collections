import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({
  collectionGroup: vi.fn(() => 'GROUP'),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: vi.fn(),
  where: vi.fn(),
}))
vi.mock('./firebase', () => ({ db: {} }))

import { deleteDoc, setDoc, where } from 'firebase/firestore'
import { acceptInvite, createInvite, declineInvite, subscribeToUserInvites } from './invites'

describe('invites email normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createInvite stores the invite under a lowercased email', async () => {
    await createInvite('owner', 'col1', 'Mixed@Example.com', 'editor')
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'collections/col1/invites/mixed@example.com' },
      expect.objectContaining({ email: 'mixed@example.com', role: 'editor' })
    )
  })

  it('subscribeToUserInvites queries with the lowercased sign-in email', () => {
    subscribeToUserInvites('Mixed@Example.com', () => {})
    expect(where).toHaveBeenCalledWith('email', '==', 'mixed@example.com')
  })

  it('acceptInvite writes the raw sign-in email on the member and deletes the lowercase invite', async () => {
    const user = { uid: 'u1', email: 'Mixed@Example.com', displayName: 'Mixed' }
    await acceptInvite(user, 'col1', 'editor', 'mixed@example.com')
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'collections/col1/members/u1' },
      expect.objectContaining({ uid: 'u1', role: 'editor', email: 'Mixed@Example.com' })
    )
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'collections/col1/invites/mixed@example.com' })
  })

  it('declineInvite deletes the lowercased invite doc', async () => {
    await declineInvite('col1', 'Mixed@Example.com')
    expect(deleteDoc).toHaveBeenCalledWith({ path: 'collections/col1/invites/mixed@example.com' })
  })
})
