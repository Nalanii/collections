import { describe, expect, it } from 'vitest'
import { buildSelectOptions, validateOptions } from './fieldOptions'

describe('validateOptions', () => {
  it('accepts a list of distinct non-blank options', () => {
    expect(validateOptions(['Mint', 'Good', 'Fair'])).toBeNull()
  })

  it('rejects an empty list', () => {
    expect(validateOptions([])).toMatch(/at least one/i)
    expect(validateOptions(undefined)).toMatch(/at least one/i)
  })

  it('rejects blank or whitespace-only options', () => {
    expect(validateOptions(['Mint', ''])).toMatch(/blank/i)
    expect(validateOptions(['   '])).toMatch(/blank/i)
  })

  it('rejects duplicates, ignoring surrounding whitespace', () => {
    expect(validateOptions(['Mint', 'Good', 'Mint'])).toMatch(/unique/i)
    expect(validateOptions(['Mint', ' Mint '])).toMatch(/unique/i)
  })
})

describe('buildSelectOptions', () => {
  it('prepends an empty choice to the defined options', () => {
    expect(buildSelectOptions(['A', 'B'], '')).toEqual([
      { value: '', label: 'None' },
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
    ])
  })

  it('keeps a current value that is no longer an option', () => {
    const result = buildSelectOptions(['A'], 'Old')
    expect(result.map((option) => option.value)).toEqual(['', 'A', 'Old'])
  })

  it('does not duplicate a current value that is still an option', () => {
    const result = buildSelectOptions(['A', 'B'], 'B')
    expect(result.map((option) => option.value)).toEqual(['', 'A', 'B'])
  })
})
