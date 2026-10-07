import { describe, expect, it } from 'vitest'
import {
  collapseWhitespace,
  findStandardizationGroups,
  groupKey,
  normalizeForComparison,
  wordOrderInsensitiveKey,
} from './standardizationGroups'

const items = (...values) => values.map((value, i) => ({ id: String(i), fields: { Author: value } }))

describe('normalizeForComparison', () => {
  it('normalizes initials, case, punctuation and leading The', () => {
    expect(normalizeForComparison('J.R.R. Tolkien')).toBe('jrr tolkien')
    expect(normalizeForComparison('J R R Tolkien')).toBe('jrr tolkien')
    expect(normalizeForComparison('JRR Tolkien')).toBe('jrr tolkien')
    expect(normalizeForComparison("The O'Brien-Smith")).toBe('o brien smith'.replace('o brien', 'obrien'))
    expect(normalizeForComparison('The')).toBe('the')
  })
})

describe('findStandardizationGroups', () => {
  it('groups Tolkien variants with counts and suggests the most frequent', () => {
    const groups = findStandardizationGroups(
      items('J.R.R. Tolkien', 'J.R.R. Tolkien', 'JRR Tolkien', 'j r r tolkien', 'Anne Rice'),
      'Author'
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].suggested).toBe('J.R.R. Tolkien')
    expect(groups[0].variants).toEqual([
      { value: 'J.R.R. Tolkien', count: 2 },
      { value: 'JRR Tolkien', count: 1 },
      { value: 'j r r tolkien', count: 1 },
    ])
  })

  it('groups a leading "The" and keeps it on ties (longer wins)', () => {
    const groups = findStandardizationGroups(
      items('Clique Summer Collection', 'The Clique Summer Collection'),
      'Author'
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].suggested).toBe('The Clique Summer Collection')
  })

  it('folds whitespace-only differences into one variant', () => {
    expect(findStandardizationGroups(items('Anne  Rice', ' Anne Rice ', 'Anne Rice'), 'Author')).toEqual([])
    const groups = findStandardizationGroups(items('Anne  Rice', 'anne rice'), 'Author')
    expect(groups[0].variants.map((v) => v.value).sort()).toEqual(['Anne Rice', 'anne rice'])
  })

  it('breaks count ties by better formatting', () => {
    const groups = findStandardizationGroups(items('anne rice', 'ANNE RICE', 'Anne Rice'), 'Author')
    expect(groups[0].suggested).toBe('Anne Rice')
  })

  it('breaks remaining ties deterministically regardless of input order', () => {
    const a = findStandardizationGroups(items('Anne Rice', 'Anne  Rice.'), 'Author')
    const b = findStandardizationGroups(items('Anne  Rice.', 'Anne Rice'), 'Author')
    expect(a).toEqual(b)
  })

  it('groups small typos in long values', () => {
    const groups = findStandardizationGroups(items('Clique Summer Collection', 'Clique Sumer Collection'), 'Author')
    expect(groups).toHaveLength(1)
  })

  it('does not group distinct people or similar short names', () => {
    expect(findStandardizationGroups(items('John Smith', 'Jane Smith'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('John Smith', 'Joan Smith'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('Anne Rice', 'Anne Ricci'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('Stephen King', 'Stephen Kind'), 'Author')).toEqual([])
    expect(findStandardizationGroups(items('Anne Rice', 'Anne Rice Jr'), 'Author')).toEqual([])
  })

  it('groups "Last, First" with "First Last"', () => {
    const groups = findStandardizationGroups(items('Stephen King', 'King, Stephen', 'Stephen King'), 'Author')
    expect(groups).toHaveLength(1)
    expect(groups[0].suggested).toBe('Stephen King')
    expect(groups[0].variants).toEqual([
      { value: 'Stephen King', count: 2 },
      { value: 'King, Stephen', count: 1 },
    ])
  })

  it('does not group different people who share a surname', () => {
    expect(findStandardizationGroups(items('Stephen King', 'Owen King'), 'Author')).toEqual([])
  })

  it('groups a one-letter typo in a single long-enough word', () => {
    expect(findStandardizationGroups(items('Tolkien', 'Tolkein'), 'Author')).toHaveLength(1)
  })

  it('ignores empty, missing and non-string values', () => {
    const list = [
      { id: '1', fields: { Author: '' } },
      { id: '2', fields: { Author: '   ' } },
      { id: '3', fields: {} },
      { id: '4' },
      { id: '5', fields: { Author: null } },
    ]
    expect(findStandardizationGroups(list, 'Author')).toEqual([])
    expect(findStandardizationGroups([], 'Author')).toEqual([])
  })

  it('returns nothing when all values are consistent', () => {
    expect(findStandardizationGroups(items('Anne Rice', 'Anne Rice', 'Stephen King'), 'Author')).toEqual([])
  })

  it('orders groups by total item count', () => {
    const groups = findStandardizationGroups(
      items('anne rice', 'Anne Rice', 'J.R.R. Tolkien', 'JRR Tolkien', 'JRR Tolkien', 'jrr tolkien'),
      'Author'
    )
    expect(groups.map((g) => g.suggested)).toEqual(['JRR Tolkien', 'Anne Rice'])
  })

  it('produces a stable group key', () => {
    const [g] = findStandardizationGroups(items('JRR Tolkien', 'J.R.R. Tolkien'), 'Author')
    const [h] = findStandardizationGroups(items('J.R.R. Tolkien', 'JRR Tolkien'), 'Author')
    expect(groupKey(g)).toBe(groupKey(h))
  })
})

// ---- Before/after check for the optimized grouping (#80) ----

// The pre-optimization implementation, kept verbatim as the reference.
function legacyEditDistance(a, b) {
  const rows = a.length + 1
  const cols = b.length + 1
  const d = Array.from({ length: rows }, () => new Array(cols).fill(0))
  for (let i = 0; i < rows; i++) d[i][0] = i
  for (let j = 0; j < cols; j++) d[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

function legacyIsFuzzyClose(a, b) {
  if (Math.min(a.length, b.length) < 6) return false
  const tokensA = a.split(' ')
  const tokensB = b.split(' ')
  if (tokensA.length !== tokensB.length) return false
  const differing = tokensA.map((token, i) => [token, tokensB[i]]).filter(([x, y]) => x !== y)
  if (differing.some(([x, y]) => Math.min(x.length, y.length) < 5)) return false
  const limit = Math.max(a.length, b.length) >= 14 ? 2 : 1
  return legacyEditDistance(a, b) <= limit
}

const legacyCompare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const legacyFormatScore = (value) => (/[a-z]/.test(value) && /[A-Z]/.test(value) ? 1 : 0)
const legacyCompareForSuggestion = (a, b) =>
  b.count - a.count ||
  legacyFormatScore(b.value) - legacyFormatScore(a.value) ||
  b.value.length - a.value.length ||
  legacyCompare(a.value, b.value)

function legacyFindStandardizationGroups(items, fieldName) {
  const counts = new Map()
  for (const item of items) {
    const raw = item.fields?.[fieldName]
    if (raw == null) continue
    const value = collapseWhitespace(String(raw))
    if (value === '') continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const variants = [...counts].map(([value, count]) => ({
    value,
    count,
    key: wordOrderInsensitiveKey(value),
  }))
  const parent = variants.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      if (find(i) === find(j)) continue
      if (variants[i].key === variants[j].key || legacyIsFuzzyClose(variants[i].key, variants[j].key)) {
        parent[find(j)] = find(i)
      }
    }
  }
  const clusters = new Map()
  variants.forEach((variant, i) => {
    const root = find(i)
    if (!clusters.has(root)) clusters.set(root, [])
    clusters.get(root).push({ value: variant.value, count: variant.count })
  })
  return [...clusters.values()]
    .filter((members) => members.length >= 2)
    .map((members) => {
      const sorted = [...members].sort(legacyCompareForSuggestion)
      return { variants: sorted, suggested: sorted[0].value }
    })
    .sort((a, b) => {
      const total = (g) => g.variants.reduce((sum, v) => sum + v.count, 0)
      return total(b) - total(a) || legacyCompare(a.suggested, b.suggested)
    })
}

// Small seeded PRNG so the fixtures are identical on every run.
function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeVocabulary(random, size) {
  const syllables = ['ka', 'lo', 'mi', 'ren', 'sul', 'tor', 've', 'an', 'dra', 'phi', 'qua', 'zen', 'bel', 'cor']
  return Array.from({ length: size }, () => {
    const count = 2 + Math.floor(random() * 3)
    return Array.from({ length: count }, () => syllables[Math.floor(random() * syllables.length)]).join('')
  })
}

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1)

function typo(random, text) {
  const i = Math.floor(random() * text.length)
  const kind = Math.floor(random() * 3)
  if (kind === 0) return text.slice(0, i) + text.slice(i + 1)
  if (kind === 1) return text.slice(0, i) + 'x' + text.slice(i)
  return i + 1 < text.length ? text.slice(0, i) + text[i + 1] + text[i] + text.slice(i + 2) : text
}

// Builds `count` field values from a smaller set of base values plus whitespace, case,
// punctuation, "The", word-order and typo variants, with some exact repeats.
function makeFixture(seed, count, makeBase) {
  const random = mulberry32(seed)
  const vocabulary = makeVocabulary(random, 400)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const values = []
  while (values.length < count) {
    const base = makeBase(random, vocabulary, pick)
    values.push(base)
    const roll = random()
    if (roll < 0.15) values.push(`  ${base.replace(' ', '   ')} `)
    else if (roll < 0.3) values.push(base.toLowerCase())
    else if (roll < 0.4) values.push(`${base}.`)
    else if (roll < 0.5) values.push(`The ${base}`)
    else if (roll < 0.6) values.push(base.split(' ').reverse().join(', '))
    else if (roll < 0.75) values.push(typo(random, base))
    else if (roll < 0.8) values.push(base)
  }
  return values.slice(0, count).map((value, i) => ({ id: String(i), fields: { Title: value } }))
}

const titleBase = (random, vocabulary, pick) =>
  Array.from({ length: 2 + Math.floor(random() * 4) }, () => capitalize(pick(vocabulary))).join(' ')
const authorBase = (random, vocabulary, pick) => `${capitalize(pick(vocabulary))} ${capitalize(pick(vocabulary))}`

describe('findStandardizationGroups matches the pre-optimization implementation', () => {
  it('returns identical groups on a 2,000-value title-like fixture', () => {
    const fixture = makeFixture(80, 2000, titleBase)
    const expected = legacyFindStandardizationGroups(fixture, 'Title')
    expect(expected.length).toBeGreaterThan(50) // the fixture really contains near-duplicates
    expect(findStandardizationGroups(fixture, 'Title')).toEqual(expected)
    // The legacy reference is quadratic and takes ~10s on a fast machine, so allow far more on CI.
  }, 120_000)

  it('returns identical groups on an author-like fixture', () => {
    const fixture = makeFixture(81, 700, authorBase)
    const expected = legacyFindStandardizationGroups(fixture, 'Title')
    expect(expected.length).toBeGreaterThan(20)
    expect(findStandardizationGroups(fixture, 'Title')).toEqual(expected)
  })

  it('returns identical groups for the hand-written cases', () => {
    const list = items(
      'J.R.R. Tolkien', 'JRR Tolkien', 'j r r tolkien', 'Anne Rice', 'Anne Ricci', 'Tolkien', 'Tolkein',
      'Stephen King', 'King, Stephen', 'Clique Summer Collection', 'Clique Sumer Collection',
      'The Clique Summer Collection', 'Clique Sumer Colection'
    )
    expect(findStandardizationGroups(list, 'Author')).toEqual(legacyFindStandardizationGroups(list, 'Author'))
  })
})
