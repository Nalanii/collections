import { describe, expect, it } from 'vitest'
import { findDuplicateItem } from './duplicateItem'

const single = [{ name: 'Title' }, { name: 'Author' }]
const double = [{ name: 'Title', main: true }, { name: 'Author', main: true }, { name: 'Year' }]

const items = [
  { id: '1', fields: { Title: 'Foo', Author: 'Bar' } },
  { id: '2', fields: { Title: 'A', Author: 'B', Year: 1999 } },
]

describe('findDuplicateItem', () => {
  it('matches a single primary field case-insensitively and trimmed', () => {
    expect(findDuplicateItem(items, single, { Title: '  fOO ', Author: 'other' }, null)).toBe(
      items[0]
    )
  })

  it('returns null when nothing matches', () => {
    expect(findDuplicateItem(items, single, { Title: 'Baz' }, null)).toBeNull()
  })

  it('ignores non-primary fields', () => {
    expect(findDuplicateItem(items, single, { Title: 'Foo', Author: 'Different' }, null)).toBe(
      items[0]
    )
  })

  it('requires both primary fields to match', () => {
    expect(findDuplicateItem(items, double, { Title: 'A', Author: 'C' }, null)).toBeNull()
    expect(findDuplicateItem(items, double, { Title: 'a', Author: 'b', Year: 2 }, null)).toBe(
      items[1]
    )
  })

  it('excludes the item being edited', () => {
    expect(findDuplicateItem(items, single, { Title: 'Foo' }, '1')).toBeNull()
  })

  it('compares numeric values as strings', () => {
    const numeric = [{ id: 'n', fields: { Title: 5 } }]
    expect(findDuplicateItem(numeric, single, { Title: '5' }, null)).toBe(numeric[0])
  })

  it('returns null for empty primary values, no items, or no field defs', () => {
    expect(findDuplicateItem([{ id: 'x', fields: {} }], single, { Title: '' }, null)).toBeNull()
    expect(findDuplicateItem(null, single, { Title: 'Foo' }, null)).toBeNull()
    expect(findDuplicateItem(items, [], { Title: 'Foo' }, null)).toBeNull()
  })
})
