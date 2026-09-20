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
})
