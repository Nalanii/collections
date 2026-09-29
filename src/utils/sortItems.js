import { isMainField } from './itemFieldSummary'

// 'accent' sensitivity ignores case but still tells accented letters apart; `numeric` makes
// "Book 2" sort before "Book 10".
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'accent' })

export function mainFieldNames(fieldDefs) {
  return fieldDefs.filter((_, index) => isMainField(fieldDefs, index)).map((fieldDef) => fieldDef.name)
}

function sortValue(item, fieldName) {
  return String(item.fields?.[fieldName] ?? '').trim()
}

// Returns a sorted copy of `items` ordered by the collection's main field(s): the first main
// field is the primary key and later ones (field-definition order) break ties. `direction` is
// 'asc' or 'desc'. Items with an empty value for a key sort after those with a value in both
// directions. Items that tie on every key keep their original relative order.
// `primaryKey` optionally names a main field to sort by first; the remaining main fields follow
// as tiebreakers. A name that isn't a main field is ignored.
export function sortItems(items, fieldDefs, direction = 'asc', primaryKey = null) {
  const mainKeys = mainFieldNames(fieldDefs)
  if (mainKeys.length === 0) {
    return items
  }
  const keys = mainKeys.includes(primaryKey)
    ? [primaryKey, ...mainKeys.filter((key) => key !== primaryKey)]
    : mainKeys
  const sign = direction === 'desc' ? -1 : 1

  return [...items].sort((a, b) => {
    for (const key of keys) {
      const aValue = sortValue(a, key)
      const bValue = sortValue(b, key)
      if (aValue === '' && bValue === '') {
        continue
      }
      if (aValue === '') {
        return 1
      }
      if (bValue === '') {
        return -1
      }
      const result = COLLATOR.compare(aValue, bValue)
      if (result !== 0) {
        return result * sign
      }
    }
    return 0
  })
}
