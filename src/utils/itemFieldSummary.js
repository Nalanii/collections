function isPresent(value) {
  return value !== undefined && value !== null && value !== ''
}

// Fields flagged `main` are main; if none are flagged, the first field is main.
export function isMainField(fieldDefs, index) {
  return fieldDefs.some((fieldDef) => fieldDef.main)
    ? Boolean(fieldDefs[index].main)
    : index === 0
}

// Splits an item's field values into the prominent "main" line and the
// secondary line, in field-definition order, skipping empty values.
export function summarizeItemFields(fieldDefs, itemFields) {
  const main = []
  const rest = []
  fieldDefs.forEach((fieldDef, index) => {
    const value = itemFields?.[fieldDef.name]
    if (!isPresent(value)) {
      return
    }
    ;(isMainField(fieldDefs, index) ? main : rest).push(
      `${fieldDef.prefix ?? ''}${value}${fieldDef.suffix ?? ''}`
    )
  })
  return { main: main.join(' · '), rest: rest.join(' · ') }
}
