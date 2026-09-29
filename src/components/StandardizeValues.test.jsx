// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../services/items', () => ({
  applyFieldValueChange: vi.fn(),
  subscribeToItems: vi.fn(),
}))

const { applyFieldValueChange, subscribeToItems } = await import('../services/items')
const { StandardizeValues } = await import('./StandardizeValues')

const fieldDefs = [{ name: 'Artist', type: 'text' }]
const items = [
  { id: 'a', fields: { Artist: 'The Beatles' } },
  { id: 'b', fields: { Artist: 'The Beatles' } },
  { id: 'c', fields: { Artist: 'the  beatles' } },
]

async function applyChange(result) {
  subscribeToItems.mockImplementation((id, callback) => {
    callback(items)
    return () => {}
  })
  applyFieldValueChange.mockResolvedValue(result)
  const user = userEvent.setup()
  render(<StandardizeValues collectionId="c1" fieldDefs={fieldDefs} />)
  await user.click(screen.getByRole('button', { name: 'Apply' }))
}

describe('StandardizeValues apply result', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('passes the expected variant values so changed items can be detected', async () => {
    await applyChange({ changed: 1, skipped: 0 })
    const [itemIds, fieldName, , variantValues] = applyFieldValueChange.mock.calls[0]
    expect(fieldName).toBe('Artist')
    expect(itemIds.length).toBeGreaterThan(0)
    expect([...variantValues]).toContain('The Beatles')
    expect((await screen.findByRole('status')).textContent).toBe('Updated 1 item')
  })

  it('reports items skipped because they changed since loading', async () => {
    await applyChange({ changed: 2, skipped: 1 })
    expect((await screen.findByRole('status')).textContent).toBe(
      'Updated 2 items, skipped 1 that changed since loading'
    )
  })
})
