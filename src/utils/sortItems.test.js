import { describe, expect, it } from 'vitest'
import { sortItems } from './sortItems'

const singleField = [
  { name: 'Title', type: 'text' },
  { name: 'Artist', type: 'text' },
]

const twoMain = [
  { name: 'Artist', type: 'text', main: true },
  { name: 'Title', type: 'text', main: true },
  { name: 'Year', type: 'number' },
]

function item(id, fields) {
  return { id, status: 'have', notes: '', fields }
}

function ids(items) {
  return items.map((entry) => entry.id)
}

describe('sortItems', () => {
  it('sorts ascending by the first field when none is flagged main', () => {
    const items = [
      item('1', { Title: 'Rumours', Artist: 'A' }),
      item('2', { Title: 'Abbey Road', Artist: 'Z' }),
      item('3', { Title: 'Nevermind', Artist: 'M' }),
    ]
    expect(ids(sortItems(items, singleField, 'asc'))).toEqual(['2', '3', '1'])
  })

  it('sorts descending', () => {
    const items = [
      item('1', { Title: 'Rumours' }),
      item('2', { Title: 'Abbey Road' }),
      item('3', { Title: 'Nevermind' }),
    ]
    expect(ids(sortItems(items, singleField, 'desc'))).toEqual(['1', '3', '2'])
  })

  it('defaults to ascending', () => {
    const items = [item('1', { Title: 'b' }), item('2', { Title: 'a' })]
    expect(ids(sortItems(items, singleField))).toEqual(['2', '1'])
  })

  it('sorts by the flagged main field rather than the first field', () => {
    const fieldDefs = [
      { name: 'Title', type: 'text' },
      { name: 'Artist', type: 'text', main: true },
    ]
    const items = [item('1', { Title: 'A', Artist: 'Zed' }), item('2', { Title: 'B', Artist: 'Abe' })]
    expect(ids(sortItems(items, fieldDefs, 'asc'))).toEqual(['2', '1'])
  })

  it('uses later main fields as tiebreakers in field-definition order', () => {
    const items = [
      item('1', { Artist: 'Bowie', Title: 'Low' }),
      item('2', { Artist: 'Abba', Title: 'Waterloo' }),
      item('3', { Artist: 'Bowie', Title: 'Heroes' }),
      item('4', { Artist: 'Abba', Title: 'Arrival' }),
    ]
    expect(ids(sortItems(items, twoMain, 'asc'))).toEqual(['4', '2', '3', '1'])
    expect(ids(sortItems(items, twoMain, 'desc'))).toEqual(['1', '3', '2', '4'])
  })

  it('keeps the original order for items that tie on every main field', () => {
    const items = [
      item('1', { Title: 'Same', Artist: 'x' }),
      item('2', { Title: 'same', Artist: 'y' }),
      item('3', { Title: 'SAME', Artist: 'z' }),
    ]
    expect(ids(sortItems(items, singleField, 'asc'))).toEqual(['1', '2', '3'])
    expect(ids(sortItems(items, singleField, 'desc'))).toEqual(['1', '2', '3'])
  })

  it('sorts items with an empty main value last in both directions', () => {
    const items = [
      item('1', { Title: '' }),
      item('2', { Title: 'Beta' }),
      item('3', {}),
      item('4', { Title: 'Alpha' }),
      item('5', { Title: '   ' }),
    ]
    expect(ids(sortItems(items, singleField, 'asc')).slice(0, 2)).toEqual(['4', '2'])
    expect(ids(sortItems(items, singleField, 'desc')).slice(0, 2)).toEqual(['2', '4'])
    expect(ids(sortItems(items, singleField, 'asc')).slice(2).sort()).toEqual(['1', '3', '5'])
    expect(ids(sortItems(items, singleField, 'desc')).slice(2).sort()).toEqual(['1', '3', '5'])
  })

  it('sorts an empty first main value after filled ones, then breaks ties on the next field', () => {
    const items = [
      item('1', { Artist: '', Title: 'A' }),
      item('2', { Artist: 'Abba', Title: 'B' }),
      item('3', { Artist: 'Abba', Title: '' }),
    ]
    expect(ids(sortItems(items, twoMain, 'asc'))).toEqual(['2', '3', '1'])
    expect(ids(sortItems(items, twoMain, 'desc'))).toEqual(['2', '3', '1'])
  })

  describe('with a chosen primary key', () => {
    const items = [
      item('1', { Artist: 'Bowie', Title: 'Low' }),
      item('2', { Artist: 'Abba', Title: 'Waterloo' }),
      item('3', { Artist: 'Bowie', Title: 'Heroes' }),
      item('4', { Artist: 'Abba', Title: 'Arrival' }),
    ]

    it('sorts by the chosen main field first', () => {
      expect(ids(sortItems(items, twoMain, 'asc', 'Title'))).toEqual(['4', '3', '1', '2'])
      expect(ids(sortItems(items, twoMain, 'desc', 'Title'))).toEqual(['2', '1', '3', '4'])
    })

    it('uses the other main fields as tiebreakers', () => {
      const tied = [
        item('1', { Artist: 'Zed', Title: 'Same' }),
        item('2', { Artist: 'Abe', Title: 'Same' }),
        item('3', { Artist: 'Mid', Title: 'Other' }),
      ]
      expect(ids(sortItems(tied, twoMain, 'asc', 'Title'))).toEqual(['3', '2', '1'])
    })

    it('matches the default when the chosen key is the first main field', () => {
      expect(ids(sortItems(items, twoMain, 'asc', 'Artist'))).toEqual(ids(sortItems(items, twoMain, 'asc')))
    })

    it('falls back to the default order for a key that is not a main field', () => {
      const expected = ids(sortItems(items, twoMain, 'asc'))
      expect(ids(sortItems(items, twoMain, 'asc', 'Year'))).toEqual(expected)
      expect(ids(sortItems(items, twoMain, 'asc', 'Nope'))).toEqual(expected)
      expect(ids(sortItems(items, twoMain, 'asc', null))).toEqual(expected)
    })

    it('still sorts empty values of the chosen key last in both directions', () => {
      const withEmpty = [
        item('1', { Artist: 'A', Title: '' }),
        item('2', { Artist: 'B', Title: 'Beta' }),
        item('3', { Artist: 'C', Title: 'Alpha' }),
      ]
      expect(ids(sortItems(withEmpty, twoMain, 'asc', 'Title'))).toEqual(['3', '2', '1'])
      expect(ids(sortItems(withEmpty, twoMain, 'desc', 'Title'))).toEqual(['2', '3', '1'])
    })
  })

  it('compares case-insensitively', () => {
    const items = [item('1', { Title: 'banana' }), item('2', { Title: 'Apple' }), item('3', { Title: 'cherry' })]
    expect(ids(sortItems(items, singleField, 'asc'))).toEqual(['2', '1', '3'])
    expect(ids(sortItems(items, singleField, 'desc'))).toEqual(['3', '1', '2'])
  })

  it('compares embedded numbers numerically', () => {
    const items = [item('1', { Title: 'Book 10' }), item('2', { Title: 'Book 2' }), item('3', { Title: 'Book 1' })]
    expect(ids(sortItems(items, singleField, 'asc'))).toEqual(['3', '2', '1'])
    expect(ids(sortItems(items, singleField, 'desc'))).toEqual(['1', '2', '3'])
  })

  it('handles numeric field values', () => {
    const fieldDefs = [{ name: 'Year', type: 'number' }]
    const items = [item('1', { Year: 1999 }), item('2', { Year: 85 }), item('3', { Year: 0 })]
    expect(ids(sortItems(items, fieldDefs, 'asc'))).toEqual(['3', '2', '1'])
  })

  it('does not mutate the input array', () => {
    const items = [item('1', { Title: 'b' }), item('2', { Title: 'a' })]
    sortItems(items, singleField, 'asc')
    expect(ids(items)).toEqual(['1', '2'])
  })

  it('returns the items unchanged when there are no fields', () => {
    const items = [item('1', {}), item('2', {})]
    expect(ids(sortItems(items, [], 'asc'))).toEqual(['1', '2'])
  })
})
