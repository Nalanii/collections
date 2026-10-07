// Finds groups of near-duplicate values for one field, so the user can merge each
// group into a single canonical spelling. Everything here is a *suggestion*; the
// matching is deliberately conservative.

const MIN_FUZZY_LENGTH = 6 // normalized length below which only exact matches group
const MIN_FUZZY_TOKEN_LENGTH = 5 // a token that differs must be at least this long
const LONG_VALUE_LENGTH = 14 // from this length, two edits are tolerated instead of one

// Trims and collapses internal whitespace runs, so whitespace-only differences are the
// same variant. Shared by grouping, the preview and applyFieldValueChange so the three
// can't drift (a mismatch would make Apply skip every item as "changed since loading").
export function collapseWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

// Comparison key: lowercase; apostrophes, periods and commas removed; other punctuation
// (hyphens etc.) becomes a space; runs of single-letter tokens merged so "J.R.R." /
// "J R R" / "JRR" agree; a leading "the " dropped.
export function normalizeForComparison(value) {
  const cleaned = String(value)
    .toLowerCase()
    .replace(/['’.,]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const merged = []
  let initials = ''
  for (const token of cleaned.split(' ').filter(Boolean)) {
    if (token.length === 1) {
      initials += token
    } else {
      if (initials) merged.push(initials)
      initials = ''
      merged.push(token)
    }
  }
  if (initials) merged.push(initials)
  if (merged.length > 1 && merged[0] === 'the') {
    merged.shift()
  }
  return merged.join(' ')
}

// Normalized key with the words sorted, so "King, Stephen" and "Stephen King" agree.
export function wordOrderInsensitiveKey(value) {
  return normalizeForComparison(value).split(' ').sort(compareStrings).join(' ')
}

const MAX_EDIT_LIMIT = 2 // the largest edit limit isFuzzyClose ever allows
const HISTOGRAM_BUCKETS = 32 // character-count buckets used to cheaply rule pairs out
const rowBuffers = [new Int32Array(64), new Int32Array(64), new Int32Array(64)] // reused DP rows

// Optimal string alignment distance (edits, deletions, insertions, adjacent swaps).
// Keeps three rolling rows instead of the full matrix, and gives up (returning a value
// above `limit`) once two consecutive rows are all over `limit`, since every later cell
// is built from those rows and can't come back down. Exact whenever the result <= limit.
function editDistance(a, b, limit) {
  const cols = b.length + 1
  if (rowBuffers[0].length < cols) {
    for (let k = 0; k < 3; k++) rowBuffers[k] = new Int32Array(cols * 2)
  }
  let [prev2, prev, curr] = rowBuffers
  for (let j = 0; j < cols; j++) prev[j] = j
  let prevMin = 0
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1)
      }
      curr[j] = best
      if (best < rowMin) rowMin = best
    }
    if (rowMin > limit && prevMin > limit) return limit + 1
    prevMin = rowMin
    ;[prev2, prev, curr] = [prev, curr, prev2]
  }
  return prev[b.length]
}

// Small typos only, and only in long-enough words: "Jane"/"John" Smith and
// "Anne Rice"/"Anne Ricci" stay apart, "Clique Sumer Collection" joins the real one.
// Takes keys with their precomputed token arrays.
function isFuzzyClose(a, b) {
  const lengthA = a.key.length
  const lengthB = b.key.length
  if (Math.min(lengthA, lengthB) < MIN_FUZZY_LENGTH) return false
  const limit = Math.max(lengthA, lengthB) >= LONG_VALUE_LENGTH ? 2 : 1
  // Edit distance is never smaller than the length difference.
  if (Math.abs(lengthA - lengthB) > limit) return false
  const tokensA = a.tokens
  const tokensB = b.tokens
  if (tokensA.length !== tokensB.length) return false
  for (let i = 0; i < tokensA.length; i++) {
    if (
      tokensA[i] !== tokensB[i] &&
      Math.min(tokensA[i].length, tokensB[i].length) < MIN_FUZZY_TOKEN_LENGTH
    ) {
      return false
    }
  }
  // Each edit moves at most two bucket counts by one (a swap moves none), so a larger
  // L1 gap between the character histograms rules the pair out without the DP.
  let gap = 0
  for (let i = 0; i < HISTOGRAM_BUCKETS; i++) {
    gap += Math.abs(a.histogram[i] - b.histogram[i])
    if (gap > 2 * limit) return false
  }
  return editDistance(a.key, b.key, limit) <= limit
}

function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function formatScore(value) {
  return /[a-z]/.test(value) && /[A-Z]/.test(value) ? 1 : 0
}

// Canonical suggestion: most frequent variant; ties go to the better-formatted one
// (mixed case beats all-lowercase / all-uppercase), then the longer one (keeps a
// leading "The", punctuation, initials), then plain code-point order for determinism.
function compareForSuggestion(a, b) {
  return (
    b.count - a.count ||
    formatScore(b.value) - formatScore(a.value) ||
    b.value.length - a.value.length ||
    compareStrings(a.value, b.value)
  )
}

// Stable identifier for a group (used to remember skipped groups).
export function groupKey(group) {
  return group.variants
    .map((variant) => variant.value)
    .sort(compareStrings)
    .join('\u0000')
}

// Returns `[{ variants: [{ value, count }], suggested }]` for groups of >= 2 distinct
// variants of `fieldName` across `items`. Variants are sorted by count desc (ties by the
// suggestion rule); groups by total count desc, then suggested value.
export function findStandardizationGroups(items, fieldName) {
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
  const union = (i, j) => {
    const rootI = find(i)
    const rootJ = find(j)
    if (rootI !== rootJ) parent[rootJ] = rootI
  }

  // Groups are the connected components of "same key or fuzzy-close", which doesn't
  // depend on comparison order. Exact-key matches join through a Map first; the fuzzy
  // pass then compares one representative per distinct key, sorted by key length so the
  // inner loop can stop once the length gap exceeds the largest edit limit.
  const byKey = new Map()
  variants.forEach((variant, i) => {
    const first = byKey.get(variant.key)
    if (first === undefined) byKey.set(variant.key, i)
    else union(first, i)
  })
  const distinct = [...byKey].map(([key, index]) => {
    const histogram = new Uint16Array(HISTOGRAM_BUCKETS)
    for (let c = 0; c < key.length; c++) histogram[key.charCodeAt(c) % HISTOGRAM_BUCKETS]++
    return { key, index, tokens: key.split(' '), histogram }
  })
  distinct.sort((a, b) => a.key.length - b.key.length)
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      if (distinct[j].key.length - distinct[i].key.length > MAX_EDIT_LIMIT) break
      if (find(distinct[i].index) === find(distinct[j].index)) continue
      if (isFuzzyClose(distinct[i], distinct[j])) union(distinct[i].index, distinct[j].index)
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
      const sorted = [...members].sort(compareForSuggestion)
      return { variants: sorted, suggested: sorted[0].value }
    })
    .sort((a, b) => {
      const total = (g) => g.variants.reduce((sum, v) => sum + v.count, 0)
      return total(b) - total(a) || compareStrings(a.suggested, b.suggested)
    })
}
