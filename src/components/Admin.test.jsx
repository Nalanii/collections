// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../services/collections', () => ({
  backfillMemberProfile: vi.fn(() => Promise.resolve()),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  removeMember: vi.fn(() => Promise.resolve()),
  subscribeToCollection: vi.fn(),
  subscribeToMembers: vi.fn(),
  updateCollection: vi.fn(),
}))
vi.mock('../services/invites', () => ({ createInvite: vi.fn() }))
vi.mock('../services/items', () => ({
  applyFieldValueChange: vi.fn(),
  subscribeToItems: vi.fn(() => () => {}),
}))

const { removeMember, subscribeToCollection, subscribeToMembers } = await import(
  '../services/collections'
)
const { Admin } = await import('./Admin')

const collection = { name: 'Books', emoji: '📚', fieldDefs: [], ownerId: 'owner' }
const ownerUser = { uid: 'owner', email: 'owner@example.com', displayName: 'Olive Owner' }
const editorUser = { uid: 'editor', email: 'editor@example.com', displayName: 'Eddie Editor' }
const members = [
  { uid: 'owner', email: 'owner@example.com', displayName: 'Olive Owner', role: 'owner' },
  { uid: 'editor', email: 'editor@example.com', displayName: 'Eddie Editor', role: 'editor' },
  { uid: 'viewer', email: 'sam@example.com', displayName: 'Sam Lee', role: 'viewer' },
]

function renderAdmin(user) {
  const onDone = vi.fn()
  render(<Admin user={user} collectionId="c1" onDone={onDone} />)
  return { onDone }
}

describe('Admin member removal', () => {
  beforeEach(() => {
    subscribeToCollection.mockImplementation((id, callback) => {
      callback(collection)
      return () => {}
    })
    subscribeToMembers.mockImplementation((id, callback) => {
      callback(members)
      return () => {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('asks before a member leaves and does not remove until confirmed', async () => {
    const user = userEvent.setup()
    renderAdmin(editorUser)

    await user.click(screen.getByRole('button', { name: 'Leave' }))

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Leave collection?')).toBeTruthy()
    expect(removeMember).not.toHaveBeenCalled()
  })

  it('closes the dialog without removing when the member stays', async () => {
    const user = userEvent.setup()
    const { onDone } = renderAdmin(editorUser)

    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Stay' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(removeMember).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('removes the member and finishes when leaving is confirmed', async () => {
    const user = userEvent.setup()
    const { onDone } = renderAdmin(editorUser)

    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Stay' }))
    await user.click(screen.getByRole('button', { name: 'Leave' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Leave' }))

    expect(removeMember).toHaveBeenCalledTimes(1)
    expect(removeMember).toHaveBeenCalledWith('c1', 'editor')
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('lets the owner cancel revoking another member', async () => {
    const user = userEvent.setup()
    renderAdmin(ownerUser)

    // Owner sees Revoke for both non-owner members; pick Sam Lee's (the second).
    await user.click(screen.getAllByRole('button', { name: 'Revoke' })[1])

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Revoke access?')).toBeTruthy()
    expect(dialog.textContent).toContain('Sam Lee')
    expect(removeMember).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(removeMember).not.toHaveBeenCalled()
  })

  it('revokes the chosen member when the owner confirms', async () => {
    const user = userEvent.setup()
    const { onDone } = renderAdmin(ownerUser)

    await user.click(screen.getAllByRole('button', { name: 'Revoke' })[1])
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }))

    expect(removeMember).toHaveBeenCalledTimes(1)
    expect(removeMember).toHaveBeenCalledWith('c1', 'viewer')
    // Revoking someone else keeps the owner on the screen.
    expect(onDone).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })
})
