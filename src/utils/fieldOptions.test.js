import { describe, expect, it } from 'vitest'
import {
  applyOptionRenames,
  buildSelectOptions,
  detectOptionRenames,
  moveOption,
  validateOptions,
} from './fieldOptions'

describe('detectOptionRenames', () => {
  it('reports an option whose text changed', () => {
    expect(detectOptionRenames(['Mint', 'Very Good'], ['Mint', 'Good'])).toEqual([
      { from: 'Good', to: 'Very Good' },
    ])
  })

  it('reports nothing when only reordered', () => {
    expect(detectOptionRenames(['Good', 'Mint'], ['Good', 'Mint'])).toEqual([])
  })

  it('ignores added rows (no original) and removed rows', () => {
    expect(detectOptionRenames(['Mint', 'New'], ['Mint', null])).toEqual([])
    expect(detectOptionRenames(['Mint'], ['Mint'])).toEqual([])
  })

  it('trims the new text and ignores whitespace-only edits', () => {
    expect(detectOptionRenames(['  Mint ', ' Best '], ['Mint', 'Good'])).toEqual([
      { from: 'Good', to: 'Best' },
    ])
  })

  it('handles missing inputs', () => {
    expect(detectOptionRenames(undefined, undefined)).toEqual([])
    expect(detectOptionRenames(['A'], undefined)).toEqual([])
  })
})

describe('applyOptionRenames', () => {
  it('maps the old value to the new one and leaves others alone', () => {
    const renames = [{ from: 'Good', to: 'Very Good' }]
    expect(applyOptionRenames('Good', renames)).toBe('Very Good')
    expect(applyOptionRenames('Mint', renames)).toBe('Mint')
  })

  it('applies swaps once rather than chaining', () => {
    const renames = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'A' },
    ]
    expect(applyOptionRenames('A', renames)).toBe('B')
    expect(applyOptionRenames('B', renames)).toBe('A')
  })
})

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

describe('moveOption', () => {
  it('moves an option up', () => {
    expect(moveOption(['Mint', 'Good', 'Fair'], 2, 'up')).toEqual(['Mint', 'Fair', 'Good'])
  })

  it('moves an option down', () => {
    expect(moveOption(['Mint', 'Good', 'Fair'], 0, 'down')).toEqual(['Good', 'Mint', 'Fair'])
  })

  it('leaves the list unchanged at the ends or out of range', () => {
    const list = ['Mint', 'Good', 'Fair']
    expect(moveOption(list, 0, 'up')).toEqual(list)
    expect(moveOption(list, 2, 'down')).toEqual(list)
    expect(moveOption(list, 5, 'up')).toEqual(list)
  })

  it('does not mutate its input', () => {
    const list = ['A', 'B']
    const result = moveOption(list, 0, 'down')
    expect(list).toEqual(['A', 'B'])
    expect(result).not.toBe(list)
  })
})
