// Returns a new fields object with every string value trimmed of leading and
// trailing whitespace. Non-string values pass through unchanged; internal
// whitespace is preserved. null/undefined input yields `{}`.
export function trimFieldValues(fields) {
  return Object.fromEntries(
    Object.entries(fields ?? {}).map(([name, value]) => [
      name,
      typeof value === 'string' ? value.trim() : value,
    ])
  )
}
