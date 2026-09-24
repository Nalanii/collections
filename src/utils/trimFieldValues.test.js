import { describe, expect, it } from 'vitest'
import { trimFieldValues } from './trimFieldValues'

describe('trimFieldValues', () => {
  it('trims leading whitespace', () => {
    expect(trimFieldValues({ a: '  x' })).toEqual({ a: 'x' })
  })

  it('trims trailing whitespace', () => {
    expect(trimFieldValues({ a: 'x \t\n' })).toEqual({ a: 'x' })
  })

  it('trims both ends', () => {
    expect(trimFieldValues({ a: '  x  ' })).toEqual({ a: 'x' })
  })

  it('preserves internal whitespace', () => {
    expect(trimFieldValues({ a: ' a  b c ' })).toEqual({ a: 'a  b c' })
  })

  it('turns whitespace-only strings into empty strings', () => {
    expect(trimFieldValues({ a: '', b: '   ' })).toEqual({ a: '', b: '' })
  })

  it('passes undefined and null values through', () => {
    expect(trimFieldValues({ a: undefined, b: null })).toEqual({ a: undefined, b: null })
  })

  it('passes non-string values through', () => {
    const list = [' a ']
    expect(trimFieldValues({ n: 5, b: true, l: list })).toEqual({ n: 5, b: true, l: list })
  })

  it('does not mutate the input', () => {
    const input = { a: '  x  ' }
    const result = trimFieldValues(input)
    expect(input).toEqual({ a: '  x  ' })
    expect(result).not.toBe(input)
  })

  it('returns an empty object for undefined or null input', () => {
    expect(trimFieldValues(undefined)).toEqual({})
    expect(trimFieldValues(null)).toEqual({})
  })
})
