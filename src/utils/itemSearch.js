import Fuse from 'fuse.js'

const FUSE_OPTIONS = {
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
}

// Fuzzy-filters `items` against `query` across each field defined in
// `fieldDefs` plus `notes`, generously typo-tolerant so a near-miss still
// surfaces a match. Returns `items` unchanged (same order) when `query` is
// empty/whitespace-only, so callers can render the full list without a
// separate "no query" branch.
export function searchItems(items, fieldDefs, query) {
  const trimmed = query.trim()
  if (trimmed === '') {
    return items
  }

  const keys = [...fieldDefs.map((fieldDef) => ['fields', fieldDef.name]), 'notes']
  const fuse = new Fuse(items, { ...FUSE_OPTIONS, keys })
  return fuse.search(trimmed).map((result) => result.item)
}
