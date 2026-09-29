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

  // memberCount includes the owner; the badge counts only the other members.
  it('shows Shared with the number of other members, not counting the owner', () => {
    renderHome([
      { id: 'a', name: 'Books', ownerId: 'me', role: 'owner', memberCount: 2 },
      { id: 'b', name: 'Games', ownerId: 'me', role: 'owner', memberCount: 4 },
    ])
    expect(screen.getByText('Shared · 1')).toBeTruthy()
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

describe('Home archived collections', () => {
  afterEach(cleanup)

  function renderWithArchived(collections, onOpenArchived = () => {}) {
    subscribeToUserCollections.mockImplementation((uid, callback) => {
      callback(collections)
      return () => {}
    })
    render(<Home user={user} onCreateCollection={() => {}} onOpenArchived={onOpenArchived} />)
  }

  it('hides archived collections from the grid and links to the archived view', async () => {
    const onOpenArchived = vi.fn()
    renderWithArchived(
      [
        { id: 'a', name: 'Books', ownerId: 'me', role: 'owner', archivedAt: null },
        { id: 'b', name: 'Games', ownerId: 'me', role: 'owner', archivedAt: { seconds: 1 } },
        { id: 'c', name: 'Legacy', ownerId: 'me', role: 'owner' },
      ],
      onOpenArchived
    )
    expect(screen.getByText('Books')).toBeTruthy()
    expect(screen.getByText('Legacy')).toBeTruthy()
    expect(screen.queryByText('Games')).toBeNull()

    screen.getByRole('button', { name: 'Archived collections' }).click()
    expect(onOpenArchived).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state and archived link when every collection is archived', () => {
    renderWithArchived([{ id: 'b', name: 'Games', ownerId: 'me', role: 'owner', archivedAt: { seconds: 1 } }])
    expect(screen.getByText('No collections yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archived collections' })).toBeTruthy()
  })

  it('shows no archived link when nothing is archived', () => {
    renderWithArchived([{ id: 'a', name: 'Books', ownerId: 'me', role: 'owner' }])
    expect(screen.queryByRole('button', { name: 'Archived collections' })).toBeNull()
  })
})
