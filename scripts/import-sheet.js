// One-off importer: loads a Google Sheets export (.csv) into an
// existing collection as item docs. See README "Importing from Google Sheets".
//
// Usage:
//   npm run import-sheet -- <collectionId> <file.csv> --uid <uid> [--dry-run]
//     [--unmatched-to-notes] [--project <id>]
//
// Set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080) to target the emulator;
// otherwise it writes to production using Admin credentials
// (GOOGLE_APPLICATION_CREDENTIALS).

import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { chunk, mapRows, parseCsv } from './import-sheet-lib.js'

const USAGE =
  'Usage: npm run import-sheet -- <collectionId> <file.csv> --uid <uid> ' +
  '[--dry-run] [--unmatched-to-notes] [--project <id>]'

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      uid: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'unmatched-to-notes': { type: 'boolean', default: false },
      project: { type: 'string' },
    },
  })

  const [collectionId, file] = positionals
  if (!collectionId || !file) fail(`Missing arguments.\n${USAGE}`)
  const uid = values.uid ?? process.env.IMPORT_UID
  if (!uid) fail(`Missing user uid: pass --uid <uid> or set IMPORT_UID.\n${USAGE}`)
  const dryRun = values['dry-run']

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  const projectId =
    values.project ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'collections-tracker-nls'
  initializeApp({ projectId })
  const db = getFirestore()

  const target = emulatorHost ? `emulator (${emulatorHost})` : `PRODUCTION (${projectId})`
  console.log(`Target: ${target}${dryRun ? ' [dry run]' : ''}`)

  const collectionSnap = await db.collection('collections').doc(collectionId).get()
  if (!collectionSnap.exists) fail(`Collection "${collectionId}" not found.`)
  const fieldDefs = collectionSnap.data().fieldDefs ?? []
  console.log(
    `Collection: ${collectionSnap.data().name ?? collectionId} (fields: ${fieldDefs.map((d) => d.name).join(', ') || 'none'})`
  )

  const rows = parseCsv(readFileSync(file, 'utf8'))
  const result = mapRows(rows, fieldDefs, { mapUnmatchedToNotes: values['unmatched-to-notes'] })

  if (!dryRun) {
    let created = 0
    for (const group of chunk(result.items)) {
      const batch = db.batch()
      for (const item of group) {
        batch.set(db.collection('items').doc(), {
          collectionId,
          status: item.status,
          fields: item.fields,
          notes: item.notes,
          createdBy: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      await batch.commit()
      created += group.length
    }
  }

  console.log('\nSummary')
  console.log(`  Rows read:           ${result.rowsRead}`)
  console.log(`  ${(dryRun ? 'Would create:' : 'Created:').padEnd(20)} ${result.items.length}`)
  console.log(`  Skipped (empty):     ${result.skippedEmpty}`)
  console.log(
    `  Unmatched headers:   ${result.unmatchedHeaders.length ? result.unmatchedHeaders.map((h) => `"${h}"`).join(', ') : 'none'}` +
      (result.unmatchedHeaders.length
        ? values['unmatched-to-notes']
          ? ' (appended to notes)'
          : ' (skipped)'
        : '')
  )
  if (result.invalidStatusRows.length) {
    console.log(
      `  Unrecognised status: ${result.invalidStatusRows.map((r) => `row ${r.row} "${r.value}"`).join(', ')} (defaulted to have)`
    )
  }
  if (dryRun) console.log('\nDry run: nothing was written.')
}

main().catch((err) => fail(err.message ?? String(err)))
