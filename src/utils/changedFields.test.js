import { describe, expect, it } from 'vitest'
import { changedFields } from './changedFields'

describe('changedFields', () => {
  it('returns only fields whose value changed', () => {
    expect(changedFields({ a: 'x', b: 'y' }, { a: 'x', b: 'z' })).toEqual({ b: 'z' })
  })

  it('treats a number and its string form as unchanged', () => {
    expect(changedFields({ price: 5 }, { price: '5' })).toEqual({})
  })

  it('treats a missing original value as empty string', () => {
    expect(changedFields({}, { a: '' })).toEqual({})
    expect(changedFields({}, { a: 'x' })).toEqual({ a: 'x' })
  })

  it('includes fields cleared to an empty string', () => {
    expect(changedFields({ a: 'x' }, { a: '' })).toEqual({ a: '' })
  })

  it('handles null/undefined input', () => {
    expect(changedFields(undefined, undefined)).toEqual({})
  })
})
