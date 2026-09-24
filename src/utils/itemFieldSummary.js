// En spaces (not collapsed by HTML) give the dot extra room in the card header.
const MAIN_SEPARATOR = ' · '

function isPresent(value) {
  return value !== undefined && value !== null && value !== ''
}

// Fields flagged `main` are main; if none are flagged, the first field is main.
export function isMainField(fieldDefs, index) {
  return fieldDefs.some((fieldDef) => fieldDef.main)
    ? Boolean(fieldDefs[index].main)
    : index === 0
}

// Splits an item's field values into the prominent "main" line (a joined
// string) and the secondary fields (an array of { name, text }), in
// field-definition order, skipping empty values.
export function summarizeItemFields(fieldDefs, itemFields) {
  const main = []
  const rest = []
  fieldDefs.forEach((fieldDef, index) => {
    const value = itemFields?.[fieldDef.name]
    if (!isPresent(value)) {
      return
    }
    const text = `${fieldDef.prefix ?? ''}${value}${fieldDef.suffix ?? ''}`
    if (isMainField(fieldDefs, index)) {
      main.push(text)
    } else {
      rest.push({ name: fieldDef.name, text })
    }
  })
  return { main: main.join(MAIN_SEPARATOR), rest }
}
