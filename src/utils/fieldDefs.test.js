import { describe, expect, it } from 'vitest'
import { normalizeFieldDef } from './fieldDefs'

describe('normalizeFieldDef', () => {
  it('ignores leftover options on a text field', () => {
    expect(normalizeFieldDef({ name: 'Title', type: 'text', options: ['a'] })).toEqual(
      normalizeFieldDef({ name: 'Title', type: 'text' })
    )
  })

  it('keeps trimmed options for a dropdown field', () => {
    expect(normalizeFieldDef({ name: 'Kind', type: 'dropdown', options: [' a ', 'b'] })).toEqual({
      name: 'Kind',
      type: 'dropdown',
      options: ['a', 'b'],
    })
  })

  it('persists suggestOptions only for text fields', () => {
    expect(normalizeFieldDef({ name: 'A', type: 'text', suggestOptions: true })).toEqual({
      name: 'A',
      type: 'text',
      suggestOptions: true,
    })
    expect(normalizeFieldDef({ name: 'A', type: 'number', suggestOptions: true })).toEqual({
      name: 'A',
      type: 'number',
    })
  })

  it('persists booleans, prefix and suffix only when set, untrimmed', () => {
    expect(
      normalizeFieldDef({ name: 'Pages', type: 'number', main: true, excludeFromSearch: true, suffix: ' pages' })
    ).toEqual({ name: 'Pages', type: 'number', main: true, excludeFromSearch: true, suffix: ' pages' })
    expect(
      normalizeFieldDef({ name: 'Pages', type: 'number', main: false, excludeFromSearch: false, prefix: '', suffix: '' })
    ).toEqual({ name: 'Pages', type: 'number' })
  })

  it('still differs for a real change', () => {
    expect(normalizeFieldDef({ name: 'Title', type: 'text' })).not.toEqual(
      normalizeFieldDef({ name: 'Name', type: 'text' })
    )
  })
})
