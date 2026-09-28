import { changedFields } from './changedFields'

// Pure helpers for detecting concurrent-edit conflicts. An editor's save is compared
// against two snapshots of the doc: `original` (what the form was opened with) and
// `current` (what is saved now). A change the editor made conflicts only when the
// same value was also changed by someone else, to something different; edits to
// different values of the same doc merge.

// Firestore Timestamps (or null/undefined for docs written before `updatedAt` existed,
// or a local serverTimestamp() not yet resolved).
export function sameTimestamp(a, b) {
  if (a == null || b == null) {
    return a == null && b == null
  }
  if (typeof a.isEqual === 'function') {
    return a.isEqual(b)
  }
  return a === b
}

function readPath(data, path) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), data)
}

// Item values are compared as strings (missing counts as ''), because the edit form
// holds every value as a string even when the stored value was a number.
function itemValue(value) {
  return String(value ?? '')
}

// Returns the `{ path, value }` writes needed to turn `original` into `edited`, where
// `path` is `['status']`, `['notes']` or `['fields', <field name>]`. Only values the
// editor actually changed are included.
export function itemChanges(original, edited) {
  const base = original ?? {}
  const changes = []
  if (itemValue(edited.status) !== itemValue(base.status)) {
    changes.push({ path: ['status'], value: edited.status })
  }
  if (itemValue(edited.notes) !== itemValue(base.notes)) {
    changes.push({ path: ['notes'], value: edited.notes })
  }
  Object.entries(changedFields(base.fields, edited.fields)).forEach(([name, value]) => {
    changes.push({ path: ['fields', name], value })
  })
  return changes
}

// Paths of `changes` that someone else also changed (to something different) since
// `original` was read.
export function findItemConflicts(changes, original, current) {
  return changes
    .filter(({ path, value }) => {
      const base = itemValue(readPath(original, path))
      const latest = itemValue(readPath(current, path))
      return latest !== base && latest !== itemValue(value)
    })
    .map(({ path }) => path)
}

// Did anything the editor can see (status, notes, fields) change between two item snapshots?
export function itemContentChanged(original, current) {
  if (itemValue(original?.status) !== itemValue(current?.status)) return true
  if (itemValue(original?.notes) !== itemValue(current?.notes)) return true
  const originalFields = original?.fields ?? {}
  const currentFields = current?.fields ?? {}
  const names = new Set([...Object.keys(originalFields), ...Object.keys(currentFields)])
  for (const name of names) {
    if (itemValue(originalFields[name]) !== itemValue(currentFields[name])) return true
  }
  return false
}

// Human-readable name for an item path, for conflict messages.
export function describeItemPath(path) {
  if (path[0] === 'fields') return path[1]
  return path[0] === 'status' ? 'Status' : 'Notes'
}

// JSON with object keys sorted, so two structurally equal values compare equal no
// matter which order their keys came back from Firestore in.
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export const COLLECTION_PARTS = ['name', 'emoji', 'fieldDefs']

function collectionPart(data, part) {
  const value = data?.[part]
  return stableStringify(part === 'fieldDefs' ? value ?? [] : value ?? '')
}

// Which of name / emoji / fieldDefs differ between two collection snapshots.
export function changedCollectionParts(original, edited) {
  return COLLECTION_PARTS.filter((part) => collectionPart(original, part) !== collectionPart(edited, part))
}

// Parts the editor changed that someone else also changed (to something different).
export function findCollectionConflicts(changedParts, original, edited, current) {
  return changedParts.filter((part) => {
    const latest = collectionPart(current, part)
    return latest !== collectionPart(original, part) && latest !== collectionPart(edited, part)
  })
}

export function describeCollectionPart(part) {
  return part === 'fieldDefs' ? 'fields' : part
}
