// Returns only the entries of `nextFields` whose value differs from `originalFields`.
// Values are compared as strings (missing counts as ''), because the edit form holds
// every value as a string even when the stored value was a number.
export function changedFields(originalFields, nextFields) {
  const original = originalFields ?? {}
  return Object.fromEntries(
    Object.entries(nextFields ?? {}).filter(
      ([name, value]) => String(original[name] ?? '') !== String(value ?? '')
    )
  )
}
