// One-off cleanup: trims leading/trailing whitespace from every item's field
// values and notes. See README "Trimming existing item whitespace".
//
// Usage:
//   npm run trim-item-fields -- [--dry-run] [--collection <id>] [--project <id>]
//
// Set FIRESTORE_EMULATOR_HOST (e.g. 127.0.0.1:8080) to target the emulator;
// otherwise it writes to production using Admin credentials
// (GOOGLE_APPLICATION_CREDENTIALS). `updatedAt` is left untouched.

import { parseArgs } from 'node:util'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { chunk } from './import-sheet-lib.js'
import { computeTrimmedItem } from './trim-item-fields-lib.js'

const USAGE = 'Usage: npm run trim-item-fields -- [--dry-run] [--collection <id>] [--project <id>]'

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

async function main() {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      collection: { type: 'string' },
      project: { type: 'string' },
    },
  })
  const dryRun = values['dry-run']

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  const projectId =
    values.project ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'collections-tracker-nls'
  initializeApp({ projectId })
  const db = getFirestore()

  const target = emulatorHost ? `emulator (${emulatorHost})` : `PRODUCTION (${projectId})`
  console.log(`Target: ${target}${dryRun ? ' [dry run]' : ''}`)

  let query = db.collection('items')
  if (values.collection) {
    query = query.where('collectionId', '==', values.collection)
    console.log(`Scope: collection ${values.collection}`)
  } else {
    console.log('Scope: all items')
  }

  const snapshot = await query.get()
  const updates = []
  for (const docSnap of snapshot.docs) {
    const change = computeTrimmedItem(docSnap.data())
    if (change) updates.push({ ref: docSnap.ref, change })
  }

  if (!dryRun) {
    for (const group of chunk(updates)) {
      const batch = db.batch()
      for (const { ref, change } of group) batch.update(ref, change)
      await batch.commit()
    }
  }

  console.log('\nSummary')
  console.log(`  Scanned:    ${snapshot.size}`)
  console.log(`  ${(dryRun ? 'Would trim:' : 'Trimmed:').padEnd(11)} ${updates.length}`)
  console.log(`  Unchanged:  ${snapshot.size - updates.length}`)
  if (dryRun) console.log('\nDry run: nothing was written.')
}

main().catch((err) => fail(`${err.message ?? String(err)}\n${USAGE}`))
