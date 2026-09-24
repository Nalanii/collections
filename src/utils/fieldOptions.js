// Validation and helpers for the option list of a `dropdown` collection field.
//
// Renamed options: item values are stored as plain strings, so when the admin
// renames an option the collection form reports it (see detectOptionRenames)
// and the save rewrites the old text to the new text on every item.
//
// Removed options: removing an option never rewrites existing items. A value
// that is no longer in the options list is kept as-is and still displayed; the
// item form shows it as an extra choice (see buildSelectOptions) so editing an
// item doesn't lose it.

// Returns null when `options` is valid, otherwise a user-facing message.
// Rules: at least one option, no blank labels, no duplicates (after trimming).
export function validateOptions(options) {
  const trimmed = (options ?? []).map((option) => option.trim())
  if (trimmed.length === 0) {
    return 'Add at least one option.'
  }
  if (trimmed.some((option) => option === '')) {
    return 'Options cannot be blank.'
  }
  if (new Set(trimmed).size !== trimmed.length) {
    return 'Options must be unique.'
  }
  return null
}

// Builds the { value, label } list for the Select: an empty choice (keeps the
// field optional), the defined options, and the current value appended when it
// is not among them.
export function buildSelectOptions(options, currentValue, emptyLabel = 'None') {
  const list = (options ?? []).map((option) => ({ value: option, label: option }))
  if (currentValue && !list.some((option) => option.value === currentValue)) {
    list.push({ value: currentValue, label: currentValue })
  }
  return [{ value: '', label: emptyLabel }, ...list]
}

// Compares an option list against the values each row started as and returns
// the `{ from, to }` renames. `originals` is parallel to `options`: the
// option's saved text, or null/undefined for a row added in this edit. Rows
// that were only reordered or removed are not renames.
export function detectOptionRenames(options, originals) {
  const renames = []
  ;(options ?? []).forEach((option, index) => {
    const original = originals?.[index]
    if (original == null) {
      return
    }
    const to = option.trim()
    if (to !== original) {
      renames.push({ from: original, to })
    }
  })
  return renames
}

// Returns the value an item should hold after `renames`, or `value` itself
// when no rename applies. Renames are matched against the old value once, so
// swapping two options' text (A->B, B->A) works.
export function applyOptionRenames(value, renames) {
  const match = (renames ?? []).find((rename) => rename.from === value)
  return match ? match.to : value
}

// Returns a copy of `list` with the item at `index` moved one step up (toward
// the start) or down. Out-of-range moves return an unchanged copy.
export function moveOption(list, index, direction) {
  const target = direction === 'up' ? index - 1 : index + 1
  const copy = [...(list ?? [])]
  if (index < 0 || index >= copy.length || target < 0 || target >= copy.length) {
    return copy
  }
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}
