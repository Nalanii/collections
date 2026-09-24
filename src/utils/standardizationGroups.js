// Finds groups of near-duplicate values for one field, so the user can merge each
// group into a single canonical spelling. Everything here is a *suggestion*; the
// matching is deliberately conservative.

const MIN_FUZZY_LENGTH = 6 // normalized length below which only exact matches group
const MIN_FUZZY_TOKEN_LENGTH = 5 // a token that differs must be at least this long
const LONG_VALUE_LENGTH = 14 // from this length, two edits are tolerated instead of one

// Trims and collapses internal whitespace runs, so whitespace-only differences are the
// same variant.
function collapseWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim()
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

// Optimal string alignment distance (edits, deletions, insertions, adjacent swaps).
function editDistance(a, b) {
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

// Small typos only, and only in long-enough words: "Jane"/"John" Smith and
// "Anne Rice"/"Anne Ricci" stay apart, "Clique Sumer Collection" joins the real one.
function isFuzzyClose(a, b) {
  if (Math.min(a.length, b.length) < MIN_FUZZY_LENGTH) return false
  const tokensA = a.split(' ')
  const tokensB = b.split(' ')
  if (tokensA.length !== tokensB.length) return false
  const differing = tokensA
    .map((token, i) => [token, tokensB[i]])
    .filter(([x, y]) => x !== y)
  if (differing.some(([x, y]) => Math.min(x.length, y.length) < MIN_FUZZY_TOKEN_LENGTH)) {
    return false
  }
  const limit = Math.max(a.length, b.length) >= LONG_VALUE_LENGTH ? 2 : 1
  return editDistance(a, b) <= limit
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
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      if (find(i) === find(j)) continue
      if (variants[i].key === variants[j].key || isFuzzyClose(variants[i].key, variants[j].key)) {
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
      const sorted = [...members].sort(compareForSuggestion)
      return { variants: sorted, suggested: sorted[0].value }
    })
    .sort((a, b) => {
      const total = (g) => g.variants.reduce((sum, v) => sum + v.count, 0)
      return total(b) - total(a) || compareStrings(a.suggested, b.suggested)
    })
}
