import { describe, expect, it } from 'vitest'
import { chunk, MAX_BATCH_WRITES } from './chunk'

describe('chunk', () => {
  it('uses the Firestore batch limit of 500 by default', () => {
    expect(MAX_BATCH_WRITES).toBe(500)
    const sizes = chunk(Array.from({ length: 1201 }, (_, i) => i)).map((c) => c.length)
    expect(sizes).toEqual([500, 500, 201])
  })

  it('returns no chunks for an empty list', () => {
    expect(chunk([])).toEqual([])
  })

  it('returns one chunk when the list fits exactly', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]])
  })

  it('respects a custom size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('preserves input order so the last element lands in the last chunk', () => {
    const list = Array.from({ length: 1001 }, (_, i) => i)
    const chunks = chunk(list)
    expect(chunks.flat()).toEqual(list)
    expect(chunks.at(-1)).toEqual([1000])
  })
})
