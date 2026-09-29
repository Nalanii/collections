// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../services/collections', () => ({
  restoreCollection: vi.fn(() => Promise.resolve()),
  subscribeToUserCollections: vi.fn(),
}))

const { restoreCollection, subscribeToUserCollections } = await import('../services/collections')
const { ArchivedCollections } = await import('./ArchivedCollections')

const user = { uid: 'me' }
const archivedAt = { seconds: 1 }

function renderArchived(collections, props = {}) {
  subscribeToUserCollections.mockImplementation((uid, callback) => {
    callback(collections)
    return () => {}
  })
  render(<ArchivedCollections user={user} onBack={() => {}} {...props} />)
}

describe('ArchivedCollections', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('lists only archived collections', () => {
    renderArchived([
      { id: 'a', name: 'Books', ownerId: 'me', role: 'owner' },
      { id: 'b', name: 'Games', ownerId: 'me', role: 'owner', archivedAt },
      { id: 'c', name: 'Music', ownerId: 'them', role: 'editor', archivedAt },
    ])
    expect(screen.queryByText('Books')).toBeNull()
    expect(screen.getByText('Games')).toBeTruthy()
    expect(screen.getByText('Music')).toBeTruthy()
  })

  it('shows an empty state when nothing is archived', () => {
    renderArchived([{ id: 'a', name: 'Books', ownerId: 'me', role: 'owner' }])
    expect(screen.getByText('No archived collections')).toBeTruthy()
  })

  it('shows a spinner while loading', () => {
    subscribeToUserCollections.mockImplementation(() => () => {})
    render(<ArchivedCollections user={user} onBack={() => {}} />)
    expect(screen.getByText('Loading collections')).toBeTruthy()
  })

  it('shows an error when loading fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    subscribeToUserCollections.mockImplementation((uid, callback) => {
      callback([], new Error('denied'))
      return () => {}
    })
    render(<ArchivedCollections user={user} onBack={() => {}} />)
    expect(screen.getByText('Could not load your collections. Please try again.')).toBeTruthy()
    consoleError.mockRestore()
  })

  it('opens a collection when its card is clicked', async () => {
    const onOpenCollection = vi.fn()
    renderArchived([{ id: 'b', name: 'Games', ownerId: 'me', role: 'owner', archivedAt }], {
      onOpenCollection,
    })
    await userEvent.setup().click(screen.getByText('Games'))
    expect(onOpenCollection).toHaveBeenCalledWith('b')
  })

  it('offers Restore only to the owner and restores without opening the card', async () => {
    const onOpenCollection = vi.fn()
    renderArchived(
      [
        { id: 'b', name: 'Games', ownerId: 'me', role: 'owner', archivedAt },
        { id: 'c', name: 'Music', ownerId: 'them', role: 'editor', archivedAt },
      ],
      { onOpenCollection }
    )
    const buttons = screen.getAllByRole('button', { name: 'Restore' })
    expect(buttons).toHaveLength(1)

    await userEvent.setup().click(buttons[0])
    expect(restoreCollection).toHaveBeenCalledWith('b')
    expect(onOpenCollection).not.toHaveBeenCalled()
  })

  it('shows a per-card error when restoring fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    restoreCollection.mockRejectedValueOnce(new Error('denied'))
    renderArchived([{ id: 'b', name: 'Games', ownerId: 'me', role: 'owner', archivedAt }])

    await userEvent.setup().click(screen.getByRole('button', { name: 'Restore' }))

    expect(await screen.findByText('Could not restore collection. Please try again.')).toBeTruthy()
    consoleError.mockRestore()
  })

  it('goes back when Back is clicked', async () => {
    const onBack = vi.fn()
    renderArchived([], { onBack })
    await userEvent.setup().click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalled()
  })
})
