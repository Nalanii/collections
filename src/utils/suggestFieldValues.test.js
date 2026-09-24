import { describe, expect, it } from 'vitest'
import { suggestFieldValues } from './suggestFieldValues'

const makeItems = (...authors) =>
  authors.map((author, index) => ({ id: String(index), fields: { Author: author, Title: 'x' } }))

const items = makeItems('J.R.R. Tolkien', 'Ursula K. Le Guin', 'Frank Herbert')

describe('suggestFieldValues', () => {
  it('returns [] for an empty or whitespace query', () => {
    expect(suggestFieldValues(items, 'Author', '')).toEqual([])
    expect(suggestFieldValues(items, 'Author', '   ')).toEqual([])
  })

  it('matches case-insensitively', () => {
    expect(suggestFieldValues(items, 'Author', 'TOLK')).toEqual(['J.R.R. Tolkien'])
  })

  it('is fuzzy for small typos', () => {
    expect(suggestFieldValues(items, 'Author', 'tolkein')).toEqual(['J.R.R. Tolkien'])
  })

  it('returns [] when nothing matches', () => {
    expect(suggestFieldValues(items, 'Author', 'zzzzqq')).toEqual([])
  })

  it('dedupes values that differ only by case', () => {
    const result = suggestFieldValues(makeItems('Tolkien', 'tolkien', 'TOLKIEN'), 'Author', 'tolk')
    expect(result).toEqual(['Tolkien'])
  })

  it('ranks exact case-insensitive matches first', () => {
    const result = suggestFieldValues(makeItems('Tolkien Estate', 'Tolkien'), 'Author', 'tolkien')
    expect(result[0]).toBe('Tolkien')
    expect(result).toContain('Tolkien Estate')
  })

  it('excludes the value exactly as typed', () => {
    expect(suggestFieldValues(items, 'Author', 'J.R.R. Tolkien')).toEqual([])
  })

  it('still suggests a case variant of what was typed', () => {
    expect(suggestFieldValues(makeItems('Tolkien'), 'Author', 'tolkien')).toEqual(['Tolkien'])
  })

  it('ignores items missing the field and empty values', () => {
    const sparse = [{ id: '1', fields: {} }, { id: '2' }, { id: '3', fields: { Author: '' } }, ...items]
    expect(suggestFieldValues(sparse, 'Author', 'herb')).toEqual(['Frank Herbert'])
  })
})
