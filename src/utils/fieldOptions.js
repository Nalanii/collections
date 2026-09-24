// Validation and helpers for the option list of a `dropdown` collection field.
//
// Removed/renamed options: item values are stored as plain strings, so editing
// a field's options never rewrites existing items. A value that is no longer in
// the options list is kept as-is and still displayed; the item form shows it as
// an extra choice (see withCurrentValue) so editing an item doesn't lose it.

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
