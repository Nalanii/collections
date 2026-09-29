// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('../services/collections', () => ({ subscribeToUserCollections: vi.fn() }))
vi.mock('../hooks/useCollectionsPrefetch', () => ({ useCollectionsPrefetch: vi.fn() }))
vi.mock('./PendingInvites', () => ({ PendingInvites: () => null }))

const { subscribeToUserCollections } = await import('../services/collections')
const { Home } = await import('./Home')

const user = { uid: 'me' }

function renderHome(collections) {
  subscribeToUserCollections.mockImplementation((uid, callback) => {
    callback(collections)
    return () => {}
  })
  render(<Home user={user} onCreateCollection={() => {}} />)
}

describe('Home sharing badges', () => {
  afterEach(cleanup)

  it('shows Shared with the member count on an owned collection with other members', () => {
    renderHome([{ id: 'a', name: 'Books', ownerId: 'me', role: 'owner', memberCount: 3 }])
    expect(screen.getByText('Shared · 3')).toBeTruthy()
  })

  it('shows no badge on an owned collection with no other members or no count yet', () => {
    renderHome([
      { id: 'a', name: 'Books', ownerId: 'me', role: 'owner', memberCount: 1 },
      { id: 'b', name: 'Games', ownerId: 'me', role: 'owner' },
    ])
    expect(screen.queryByText(/^Shared/)).toBeNull()
  })

  it('keeps the Shared with me and Read-only badges for non-owners', () => {
    renderHome([{ id: 'a', name: 'Books', ownerId: 'them', role: 'viewer' }])
    expect(screen.getByText('Shared with me')).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
  })
})
