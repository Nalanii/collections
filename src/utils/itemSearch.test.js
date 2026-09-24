import { describe, expect, it } from 'vitest'
import { searchItems } from './itemSearch'

const fieldDefs = [
  { name: 'Title', type: 'text' },
  { name: 'Artist', type: 'text' },
]

const items = [
  {
    id: '1',
    status: 'have',
    notes: 'Signed copy',
    fields: { Title: 'Rumours', Artist: 'Fleetwood Mac' },
  },
  {
    id: '2',
    status: 'iso',
    notes: '',
    fields: { Title: 'Nevermind', Artist: 'Nirvana' },
  },
  {
    id: '3',
    status: 'have',
    notes: 'Looking for a reissue with different notes text',
    fields: { Title: 'Abbey Road', Artist: 'The Beatles' },
  },
]

describe('searchItems', () => {
  it('returns every item unchanged when the query is empty', () => {
    expect(searchItems(items, fieldDefs, '')).toEqual(items)
  })

  it('returns every item unchanged when the query is only whitespace', () => {
    expect(searchItems(items, fieldDefs, '   ')).toEqual(items)
  })

  it('matches an exact field value', () => {
    const result = searchItems(items, fieldDefs, 'Nevermind')
    expect(result.map((item) => item.id)).toEqual(['2'])
  })

  it('matches a near-miss typo of a field value (fuzzy, typo-tolerant)', () => {
    const result = searchItems(items, fieldDefs, 'Rumors')
    expect(result.map((item) => item.id)).toContain('1')
  })

  it('matches against notes, not just the defined fields', () => {
    const result = searchItems(items, fieldDefs, 'reissue')
    expect(result.map((item) => item.id)).toEqual(['3'])
  })

  it('returns an empty array when nothing matches', () => {
    const result = searchItems(items, fieldDefs, 'zzzzzzzzzzzzzzzzzzzz')
    expect(result).toEqual([])
  })

  it('does not return unrelated items for a short query with scattered character overlap', () => {
    const movieFieldDefs = [{ name: 'Title', type: 'text' }]
    const movies = [
      { id: 'm1', status: 'have', notes: '', fields: { Title: 'Matrix' } },
      { id: 'm2', status: 'have', notes: '', fields: { Title: 'Matrix Reloaded' } },
      { id: 'm3', status: 'have', notes: '', fields: { Title: 'The Shawshank Redemption' } },
    ]

    const result = searchItems(movies, movieFieldDefs, 'matr')
    expect(result.map((item) => item.id).sort()).toEqual(['m1', 'm2'])
  })

  it('matches dropdown field values like text', () => {
    const dropdownFieldDefs = [
      { name: 'Title', type: 'text' },
      { name: 'Condition', type: 'dropdown', options: ['Mint', 'Good', 'Fair'] },
    ]
    const dropdownItems = [
      { id: 'd1', status: 'have', notes: '', fields: { Title: 'Rumours', Condition: 'Mint' } },
      { id: 'd2', status: 'have', notes: '', fields: { Title: 'Abbey Road', Condition: 'Good' } },
    ]

    const result = searchItems(dropdownItems, dropdownFieldDefs, 'Mint')
    expect(result.map((item) => item.id)).toEqual(['d1'])
  })

  it('ignores fields marked excludeFromSearch but still matches the rest', () => {
    const excludingFieldDefs = [
      { name: 'Title', type: 'text' },
      { name: 'Artist', type: 'text', excludeFromSearch: true },
    ]

    expect(searchItems(items, excludingFieldDefs, 'Nirvana')).toEqual([])
    expect(searchItems(items, excludingFieldDefs, 'Nevermind').map((item) => item.id)).toEqual(['2'])
  })

  it('matches a field whose name contains a literal dot', () => {
    const dottedFieldDefs = [...fieldDefs, { name: 'Cat. No.', type: 'text' }]
    const dottedItems = [
      ...items,
      {
        id: '4',
        status: 'have',
        notes: '',
        fields: { Title: 'Kind of Blue', Artist: 'Miles Davis', 'Cat. No.': 'AB-1234' },
      },
    ]

    const result = searchItems(dottedItems, dottedFieldDefs, 'AB-1234')
    expect(result.map((item) => item.id)).toContain('4')
  })
})
