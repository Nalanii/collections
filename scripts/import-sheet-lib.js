// Pure logic for scripts/import-sheet.js. No Firestore or file I/O in here so
// it can be unit tested directly (tests/import-sheet.test.js).

export const MAX_BATCH_SIZE = 500

// RFC 4180 CSV parser: quoted fields, embedded commas/newlines, "" escaped
// quotes, CRLF or LF row endings. Strips a leading UTF-8 BOM. Returns an
// array of rows (arrays of strings). A trailing newline does not add a row.
export function parseCsv(text) {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < input.length) {
    const ch = input[i]
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
    i += 1
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export function cellToString(value) {
  if (value == null) return ''
  return String(value).trim()
}

// Returns { status, recognised }. Blank defaults to 'have' (recognised);
// anything other than have/iso (case-insensitive) falls back to 'have' with
// recognised=false so the caller can warn about it.
export function normalizeStatus(value) {
  const text = cellToString(value).toLowerCase()
  if (text === '') return { status: 'have', recognised: true }
  if (text === 'have' || text === 'iso') return { status: text, recognised: true }
  return { status: 'have', recognised: false }
}

// Maps each header column to a target. Matching is case-insensitive and
// whitespace-insensitive. Field definition names win over the special
// `status`/`notes` columns; a second column that resolves to an already
// claimed target is reported as unmatched (or as notes, if mapUnmatchedToNotes).
// Returns { columns, unmatchedHeaders } where columns[i] is
// { kind: 'field', name } | { kind: 'status' } | { kind: 'notes' } |
// { kind: 'extraNotes', header } | null (ignored).
export function matchHeaders(headers, fieldDefs, { mapUnmatchedToNotes = false } = {}) {
  const fieldNamesByKey = new Map()
  for (const def of fieldDefs) {
    const key = normalizeHeader(def.name)
    if (key && !fieldNamesByKey.has(key)) fieldNamesByKey.set(key, def.name)
  }

  const claimed = new Set()
  const columns = []
  const unmatchedHeaders = []

  for (const rawHeader of headers) {
    const header = cellToString(rawHeader)
    const key = normalizeHeader(header)
    let column = null

    if (key !== '') {
      let candidate = null
      if (fieldNamesByKey.has(key)) candidate = { kind: 'field', name: fieldNamesByKey.get(key) }
      else if (key === 'status') candidate = { kind: 'status' }
      else if (key === 'notes') candidate = { kind: 'notes' }

      const claimKey = candidate && (candidate.kind === 'field' ? `f:${candidate.name}` : candidate.kind)
      if (candidate && !claimed.has(claimKey)) {
        claimed.add(claimKey)
        column = candidate
      }
    }

    if (column === null && key !== '') {
      unmatchedHeaders.push(header)
      if (mapUnmatchedToNotes) column = { kind: 'extraNotes', header }
    }
    columns.push(column)
  }

  return { columns, unmatchedHeaders }
}

// rows: array of arrays; rows[0] is the header row. Returns
// { items, rowsRead, skippedEmpty, unmatchedHeaders, invalidStatusRows }
// where each item is { status, fields, notes } (no collectionId/uid/timestamps).
// `fields` has a string value for every field def (empty string when blank),
// matching what the UI writes.
export function mapRows(rows, fieldDefs, options = {}) {
  const [headerRow = [], ...dataRows] = rows
  const { columns, unmatchedHeaders } = matchHeaders(headerRow, fieldDefs, options)

  const items = []
  const invalidStatusRows = []
  let skippedEmpty = 0

  dataRows.forEach((row, index) => {
    const sheetRow = index + 2 // 1-based, header is row 1
    const cells = columns.map((_, i) => cellToString(row[i]))
    if (cells.every((cell) => cell === '')) {
      skippedEmpty += 1
      return
    }

    const fields = Object.fromEntries(fieldDefs.map((def) => [def.name, '']))
    let statusCell = ''
    let notes = ''
    const extraNotes = []

    columns.forEach((column, i) => {
      const value = cells[i]
      if (!column || value === '') return
      if (column.kind === 'field') fields[column.name] = value
      else if (column.kind === 'status') statusCell = value
      else if (column.kind === 'notes') notes = value
      else extraNotes.push(`${column.header}: ${value}`)
    })

    if (extraNotes.length > 0) {
      notes = [notes, ...extraNotes].filter(Boolean).join('\n')
    }

    // The UI refuses to save an item with no field values and no notes, so a
    // row with only a status or only ignored columns counts as empty.
    if (Object.values(fields).every((v) => v === '') && notes === '') {
      skippedEmpty += 1
      return
    }

    const { status, recognised } = normalizeStatus(statusCell)
    if (!recognised) invalidStatusRows.push({ row: sheetRow, value: statusCell })
    items.push({ status, fields, notes })
  })

  return {
    items,
    rowsRead: dataRows.length,
    skippedEmpty,
    unmatchedHeaders,
    invalidStatusRows,
  }
}

export function chunk(list, size = MAX_BATCH_SIZE) {
  const chunks = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return chunks
}
