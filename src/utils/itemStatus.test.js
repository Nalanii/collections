import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITEM_STATUS,
  ITEM_STATUSES,
  isKnownStatus,
  normalizeStatus,
  statusLabel,
} from './itemStatus'

describe('ITEM_STATUSES', () => {
  it('lists have and iso with their labels, defaulting to have', () => {
    expect(ITEM_STATUSES).toEqual([
      { value: 'have', label: 'Have' },
      { value: 'iso', label: 'ISO' },
    ])
    expect(DEFAULT_ITEM_STATUS).toBe('have')
  })
})

describe('normalizeStatus', () => {
  it('keeps canonical values', () => {
    expect(normalizeStatus('have')).toBe('have')
    expect(normalizeStatus('iso')).toBe('iso')
  })

  it('ignores case and surrounding whitespace', () => {
    expect(normalizeStatus('HAVE')).toBe('have')
    expect(normalizeStatus(' ISO ')).toBe('iso')
  })

  it('falls back to have for unknown or missing values', () => {
    expect(normalizeStatus('wishlist')).toBe('have')
    expect(normalizeStatus('')).toBe('have')
    expect(normalizeStatus(undefined)).toBe('have')
    expect(normalizeStatus(null)).toBe('have')
    expect(normalizeStatus(42)).toBe('have')
  })
})

describe('statusLabel', () => {
  it('labels canonical values', () => {
    expect(statusLabel('have')).toBe('Have')
    expect(statusLabel('iso')).toBe('ISO')
  })

  it('labels case and whitespace variants', () => {
    expect(statusLabel('HAVE')).toBe('Have')
    expect(statusLabel(' ISO ')).toBe('ISO')
  })

  it('labels unknown or missing values as Have', () => {
    expect(statusLabel('wishlist')).toBe('Have')
    expect(statusLabel('')).toBe('Have')
    expect(statusLabel(undefined)).toBe('Have')
    expect(statusLabel(null)).toBe('Have')
  })
})

describe('isKnownStatus', () => {
  it('accepts have and iso in any case with surrounding whitespace', () => {
    expect(isKnownStatus('have')).toBe(true)
    expect(isKnownStatus('iso')).toBe(true)
    expect(isKnownStatus('HAVE')).toBe(true)
    expect(isKnownStatus(' ISO ')).toBe(true)
  })

  it('rejects unknown, blank, and non-string values', () => {
    expect(isKnownStatus('wishlist')).toBe(false)
    expect(isKnownStatus('')).toBe(false)
    expect(isKnownStatus(undefined)).toBe(false)
    expect(isKnownStatus(null)).toBe(false)
    expect(isKnownStatus(42)).toBe(false)
  })
})
