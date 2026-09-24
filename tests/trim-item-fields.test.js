import { describe, expect, it } from 'vitest'
import { computeTrimmedItem } from '../scripts/trim-item-fields-lib.js'

describe('computeTrimmedItem', () => {
  it('returns null when nothing needs trimming', () => {
    expect(computeTrimmedItem({ fields: { a: 'x y', n: 3 }, notes: 'ok' })).toBeNull()
  })

  it('trims fields and returns both fields and notes', () => {
    expect(computeTrimmedItem({ fields: { a: ' x ', b: 'y' }, notes: 'n' })).toEqual({
      fields: { a: 'x', b: 'y' },
      notes: 'n',
    })
  })

  it('trims notes only', () => {
    expect(computeTrimmedItem({ fields: { a: 'x' }, notes: '  hi\n' })).toEqual({
      fields: { a: 'x' },
      notes: 'hi',
    })
  })

  it('handles missing fields and notes', () => {
    expect(computeTrimmedItem({})).toBeNull()
    expect(computeTrimmedItem({ notes: ' a ' })).toEqual({ fields: undefined, notes: 'a' })
  })

  it('leaves non-string values alone', () => {
    expect(computeTrimmedItem({ fields: { a: null, b: 2 }, notes: null })).toBeNull()
  })
})
