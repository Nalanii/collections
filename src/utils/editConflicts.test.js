import { describe, expect, it } from 'vitest'
import {
  changedCollectionParts,
  findCollectionConflicts,
  findItemConflicts,
  itemChanges,
  itemContentChanged,
  sameTimestamp,
} from './editConflicts'

function ts(millis) {
  return { millis, isEqual: (other) => other?.millis === millis }
}

describe('sameTimestamp', () => {
  it('treats two missing timestamps as equal', () => {
    expect(sameTimestamp(undefined, null)).toBe(true)
  })

  it('treats missing vs present as different', () => {
    expect(sameTimestamp(null, ts(1))).toBe(false)
    expect(sameTimestamp(ts(1), undefined)).toBe(false)
  })

  it('compares timestamps with isEqual', () => {
    expect(sameTimestamp(ts(1), ts(1))).toBe(true)
    expect(sameTimestamp(ts(1), ts(2))).toBe(false)
  })
})

describe('itemChanges', () => {
  const original = { status: 'have', notes: 'n', fields: { Title: 'A', Year: 1999 } }

  it('returns only the values the editor changed', () => {
    const changes = itemChanges(original, {
      status: 'have',
      notes: 'n',
      fields: { Title: 'B', Year: '1999' },
    })
    expect(changes).toEqual([{ path: ['fields', 'Title'], value: 'B' }])
  })

  it('includes status and notes when changed', () => {
    const changes = itemChanges(original, {
      status: 'iso',
      notes: 'new',
      fields: { Title: 'A', Year: '1999' },
    })
    expect(changes).toEqual([
      { path: ['status'], value: 'iso' },
      { path: ['notes'], value: 'new' },
    ])
  })

  it('returns nothing when nothing changed', () => {
    expect(itemChanges(original, { status: 'have', notes: 'n', fields: { Title: 'A', Year: '1999' } })).toEqual([])
  })
})

describe('findItemConflicts', () => {
  const original = { status: 'have', notes: '', fields: { Title: 'A', Format: 'LP' } }

  it('flags a value both editors changed differently', () => {
    const changes = [{ path: ['fields', 'Title'], value: 'Mine' }]
    const current = { ...original, fields: { ...original.fields, Title: 'Theirs' } }
    expect(findItemConflicts(changes, original, current)).toEqual([['fields', 'Title']])
  })

  it('does not flag edits to different values', () => {
    const changes = [{ path: ['fields', 'Title'], value: 'Mine' }]
    const current = { ...original, notes: 'theirs', fields: { ...original.fields, Format: 'CD' } }
    expect(findItemConflicts(changes, original, current)).toEqual([])
  })

  it('does not flag both editors making the same change', () => {
    const changes = [{ path: ['status'], value: 'iso' }]
    expect(findItemConflicts(changes, original, { ...original, status: 'iso' })).toEqual([])
  })
})

describe('itemContentChanged', () => {
  const original = { status: 'have', notes: '', fields: { Title: 'A', Year: 1999 } }

  it('ignores representation-only differences', () => {
    expect(itemContentChanged(original, { status: 'have', fields: { Title: 'A', Year: '1999' } })).toBe(false)
  })

  it('detects a changed field, status or notes', () => {
    expect(itemContentChanged(original, { ...original, fields: { Title: 'B', Year: 1999 } })).toBe(true)
    expect(itemContentChanged(original, { ...original, status: 'iso' })).toBe(true)
    expect(itemContentChanged(original, { ...original, notes: 'x' })).toBe(true)
  })
})

describe('collection conflicts', () => {
  const original = {
    name: 'Records',
    emoji: '📀',
    fieldDefs: [{ name: 'Title', type: 'text', main: true }],
  }

  it('ignores key order when comparing field definitions', () => {
    const reordered = { ...original, fieldDefs: [{ main: true, type: 'text', name: 'Title' }] }
    expect(changedCollectionParts(original, reordered)).toEqual([])
  })

  it('lists the parts that changed', () => {
    const edited = { ...original, name: 'Vinyl' }
    expect(changedCollectionParts(original, edited)).toEqual(['name'])
  })

  it('flags a part both editors changed differently', () => {
    const edited = { ...original, fieldDefs: [...original.fieldDefs, { name: 'Year', type: 'number' }] }
    const current = { ...original, fieldDefs: [...original.fieldDefs, { name: 'Label', type: 'text' }] }
    const parts = changedCollectionParts(original, edited)
    expect(findCollectionConflicts(parts, original, edited, current)).toEqual(['fieldDefs'])
  })

  it('merges edits to different parts', () => {
    const edited = { ...original, name: 'Vinyl' }
    const current = { ...original, emoji: '💿' }
    const parts = changedCollectionParts(original, edited)
    expect(findCollectionConflicts(parts, original, edited, current)).toEqual([])
  })
})
