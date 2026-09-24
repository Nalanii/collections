import { describe, expect, it } from 'vitest'
import { findStandardizationGroups, groupKey, normalizeForComparison } from './standardizationGroups'

const items = (...values) => values.map((value, i) => ({ id: String(i), fields: { Author: value } }))

describe('normalizeForComparison', () => {
  it('normalizes initials, case, punctuation and leading The', () => {
    expect(normalizeForComparison('J.R.R. Tolkien')).toBe('jrr tolkien')
    expect(normalizeForComparison('J R R Tolkien')).toBe('jrr tolkien')
    expect(normalizeForComparison('JRR Tolkien')).toBe('jrr tolkien')
    expect(normalizeForComparison("The O'Brien-Smith")).toBe('o brien smith'.replace('o brien', 'obrien'))
    expect(normalizeForComparison('The')).toBe('the')
  })
})

describe('findStandardizationGroups', () => {
  it('groups Tolkien variants with counts and suggests the most frequent', () => {
    const groups = findStandardizationGroups(
      items('J.R.R. Tolkien', 'J.R.R. Tolkien', 'JRR Tolkien', 'j r r tolkien', 'Anne Rice'),
      'Author'
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].suggested).toBe('J.R.R. Tolkien')
    expect(groups[0].variants).toEqual([
      { value: 'J.R.R. Tolkien', count: 2 },
      { value: 'JRR Tolkien', count: 1 },
      { value: 'j r r tolkien', count: 1 },
    ])
  })

  it('groups a leading "The" and keeps it on ties (longer wins)', () => {
    const groups = findStandardizationGroups(
      items('Clique Summer Collection', 'The Clique Summer Collection'),
      'Author'
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].suggested).toBe('The Clique Summer Collection')
  })

  it('folds whitespace-only differences into one variant', () => {
    expect(findStandardizationGroups(items('Anne  Rice', ' Anne Rice ', 'Anne Rice'), 'Author')).toEqual([])
    const groups = findStandardizationGroups(items('Anne  Rice', 'anne rice'), 'Author')
    expect(groups[0].variants.map((v) => v.value).sort()).toEqual(['Anne Rice', 'anne rice'])
  })

  it('breaks count ties by better formatting', () => {
    const groups = findStandardizationGroups(items('anne rice', 'ANNE RICE', 'Anne Rice'), 'Author')
    expect(groups[0].suggested).toBe('Anne Rice')
  })

  it('breaks remaining ties deterministically regardless of input order', () => {
    const a = findStandardizationGroups(items('Anne Rice', 'Anne  Rice.'), 'Author')
    const b = findStandardizationGroups(items('Anne  Rice.', 'Anne Rice'), 'Author')
    expect(a).toEqual(b)
  })

  it('groups small typos in long values', () => {
    const groups = findStandardizationGroups(items('Clique Summer Collection', 'Clique Sumer Collection'), 'Author')
    expect(groups).toHaveLength(1)
  })

  it('does not group distinct people or similar short names', () => {
    expect(findStandardizationGroups(items('John Smith', 'Jane Smith'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('John Smith', 'Joan Smith'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('Anne Rice', 'Anne Ricci'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('Stephen King', 'Stephen Kind'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('Anne Rice', 'Anne Rice Jr'), 'Author')).toEqual([])
  })

  it('groups "Last, First" with "First Last"', () => {
    const groups = findStandardizationGroups(items('Stephen King', 'King, Stephen', 'Stephen King'), 'Author')
    expect(groups).toHaveLength(1)
    expect(groups[0].suggested).toBe('Stephen King')
    expect(groups[0].variants).toEqual([
      { value: 'Stephen King', count: 2 },
      { value: 'King, Stephen', count: 1 },
    ])
  })

  it('does not group different people who share a surname', () => {
    expect(findStandardizationGroups(items('Stephen King', 'Owen King'), 'Author')).toEqual([])
  })

  it('groups a one-letter typo in a single long-enough word', () => {
    expect(findStandardizationGroups(items('Tolkien', 'Tolkein'), 'Author')).toHaveLength(1)
  })

  it('ignores empty, missing and non-string values', () => {
    const list = [
      { id: '1', fields: { Author: '' } },
      { id: '2', fields: { Author: '   ' } },
      { id: '3', fields: {} },
      { id: '4' },
      { id: '5', fields: { Author: null } },
    ]
    expect(findStandardizationGroups(list, 'Author')).toEqual([])
    expect(findStandardizationGroups([], 'Author')).toEqual([])
  })

  it('returns nothing when all values are consistent', () => {
    expect(findStandardizationGroups(items('Anne Rice', 'Anne Rice', 'Stephen King'), 'Author')).toEqual([])
  })

  it('orders groups by total item count', () => {
    const groups = findStandardizationGroups(
      items('anne rice', 'Anne Rice', 'J.R.R. Tolkien', 'JRR Tolkien', 'JRR Tolkien', 'jrr tolkien'),
      'Author'
    )
    expect(groups.map((g) => g.suggested)).toEqual(['JRR Tolkien', 'Anne Rice'])
  })

  it('produces a stable group key', () => {
    const [g] = findStandardizationGroups(items('JRR Tolkien', 'J.R.R. Tolkien'), 'Author')
    const [h] = findStandardizationGroups(items('J.R.R. Tolkien', 'JRR Tolkien'), 'Author')
    expect(groupKey(g)).toBe(groupKey(h))
  })
})
