import Fuse from 'fuse.js'

// Just under item search (0.3) so suggestions stay relevant; 0.29 still admits a
// two-letter transposition in a 7-char query ("tolkein" -> "Tolkien").
const FUSE_OPTIONS = {
  threshold: 0.29,
  ignoreLocation: true,
  minMatchCharLength: 1,
}

// Returns distinct values already stored for `fieldName` across `items` that
// fuzzy-match `query` (case-insensitive, tolerant of small typos). Values that
// differ only by case are collapsed into one (first seen wins), exact
// case-insensitive matches come first, and the value exactly as typed is never
// suggested. Returns [] for an empty query or when nothing matches.
export function suggestFieldValues(items, fieldName, query) {
  const trimmed = query.trim()
  if (trimmed === '') {
    return []
  }

  const seen = new Set()
  const values = []
  for (const item of items) {
    const raw = item.fields?.[fieldName]
    if (raw == null) {
      continue
    }
    const value = String(raw).trim()
    const key = value.toLowerCase()
    if (value === '' || seen.has(key)) {
      continue
    }
    seen.add(key)
    values.push(value)
  }

  const lowerQuery = trimmed.toLowerCase()
  const matches = new Fuse(values, FUSE_OPTIONS).search(trimmed).map((result) => result.item)
  const exact = matches.filter((value) => value.toLowerCase() === lowerQuery)
  const rest = matches.filter((value) => value.toLowerCase() !== lowerQuery)
  return [...exact, ...rest].filter((value) => value !== query && value !== trimmed)
}
