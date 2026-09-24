import { describe, expect, it } from 'vitest'
import { isMainField, summarizeItemFields } from './itemFieldSummary'

const fieldDefs = [
  { name: 'Title', type: 'text' },
  { name: 'Author', type: 'text' },
  { name: 'Pages', type: 'number' },
]

describe('summarizeItemFields', () => {
  it('treats the first field as main when none are marked', () => {
    const result = summarizeItemFields(fieldDefs, { Title: 'Dune', Author: 'Herbert', Pages: '412' })
    expect(result).toEqual({ main: 'Dune', rest: 'Herbert · 412' })
  })

  it('uses the fields marked main, in field-definition order', () => {
    const defs = [fieldDefs[0], { ...fieldDefs[1], main: true }, { ...fieldDefs[2], main: true }]
    const result = summarizeItemFields(defs, { Title: 'Dune', Author: 'Herbert', Pages: '412' })
    expect(result).toEqual({ main: 'Herbert · 412', rest: 'Dune' })
  })

  it('skips empty values', () => {
    const defs = [{ ...fieldDefs[0], main: true }, { ...fieldDefs[1], main: true }, fieldDefs[2]]
    const result = summarizeItemFields(defs, { Title: 'Dune', Author: '', Pages: undefined })
    expect(result).toEqual({ main: 'Dune', rest: '' })
  })

  it('does not fall back to another field when the default first field is empty', () => {
    const result = summarizeItemFields(fieldDefs, { Title: '', Author: 'Herbert' })
    expect(result).toEqual({ main: '', rest: 'Herbert' })
  })

  it('keeps zero values and handles missing item fields', () => {
    expect(summarizeItemFields(fieldDefs, { Pages: 0 })).toEqual({ main: '', rest: '0' })
    expect(summarizeItemFields(fieldDefs, undefined)).toEqual({ main: '', rest: '' })
  })
})

describe('isMainField', () => {
  it('falls back to the first field when none are marked', () => {
    expect([0, 1, 2].map((i) => isMainField(fieldDefs, i))).toEqual([true, false, false])
  })

  it('uses only the marked fields when any are marked', () => {
    const marked = [fieldDefs[0], { ...fieldDefs[1], main: true }, { ...fieldDefs[2], main: true }]
    expect([0, 1, 2].map((i) => isMainField(marked, i))).toEqual([false, true, true])
  })
})
