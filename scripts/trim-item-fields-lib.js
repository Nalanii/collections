// Pure logic for scripts/trim-item-fields.js (tests/trim-item-fields.test.js).

import { trimFieldValues } from '../src/utils/trimFieldValues.js'

// Given an item doc's data, returns `{ fields, notes }` with leading/trailing
// whitespace trimmed, or null if nothing would change.
export function computeTrimmedItem(data) {
  const fields = data?.fields
  const notes = data?.notes
  const trimmedFields = fields && typeof fields === 'object' ? trimFieldValues(fields) : fields
  const trimmedNotes = typeof notes === 'string' ? notes.trim() : notes

  const fieldsChanged =
    trimmedFields !== fields && Object.keys(trimmedFields).some((key) => trimmedFields[key] !== fields[key])
  const notesChanged = trimmedNotes !== notes
  if (!fieldsChanged && !notesChanged) return null

  return { fields: trimmedFields, notes: trimmedNotes }
}
