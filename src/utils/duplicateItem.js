import { isMainField } from './itemFieldSummary'

function normalize(value) {
  return value === undefined || value === null ? '' : String(value).trim().toLowerCase()
}

// Returns the first existing item whose primary field values all match `fields`
// (case-insensitive, trimmed), skipping the item being edited. Null if none.
export function findDuplicateItem(items, fieldDefs, fields, excludeItemId) {
  const mainNames = fieldDefs
    .filter((fieldDef, index) => isMainField(fieldDefs, index))
    .map((fieldDef) => fieldDef.name)
  if (!items || mainNames.length === 0) {
    return null
  }
  const wanted = mainNames.map((name) => normalize(fields?.[name]))
  if (wanted.some((value) => value === '')) {
    return null
  }
  return (
    items.find(
      (item) =>
        item.id !== excludeItemId &&
        mainNames.every((name, i) => normalize(item.fields?.[name]) === wanted[i])
    ) ?? null
  )
}
