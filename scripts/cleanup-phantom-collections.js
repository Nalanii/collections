// One-off cleanup for issue #68: removes phantom `collections/{id}` parents
// (non-existent docs that still have members/invites subcollections) and items
// whose collectionId no longer exists.
//
// Usage:
//   npm run cleanup-phantom-collections -- [--apply] [--project <id>]
//
// Dry run by default (writes nothing). Pass --apply to delete. Set
// FIRESTORE_EMULATOR_HOST to target the emulator; otherwise it targets
// PRODUCTION using Admin credentials (GOOGLE_APPLICATION_CREDENTIALS).
// Take a Firestore export/backup before running with --apply. See README.

import { parseArgs } from 'node:util'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const SUBCOLLECTIONS = ['members', 'invites']

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      project: { type: 'string' },
    },
  })
  const apply = values.apply
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  const projectId =
    values.project ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'collections-tracker-nls'
  initializeApp({ projectId })
  const db = getFirestore()

  const target = emulatorHost ? `emulator (${emulatorHost})` : `PRODUCTION (${projectId})`
  console.log(`Target: ${target}${apply ? ' [APPLY]' : ' [dry run]'}`)

  // listDocuments() returns refs for every doc id under the collection,
  // including phantom (non-existent) parents that only have subcollections.
  const refs = await db.collection('collections').listDocuments()
  const liveIds = new Set()
  const phantoms = []
  for (const ref of refs) {
    const snap = await ref.get()
    if (snap.exists) liveIds.add(ref.id)
    else phantoms.push(ref)
  }

  let phantomDocsDeleted = 0
  for (const ref of phantoms) {
    for (const sub of SUBCOLLECTIONS) {
      const docs = await ref.collection(sub).get()
      console.log(`  phantom ${ref.id}/${sub}: ${docs.size} doc(s)`)
      phantomDocsDeleted += docs.size
      if (apply && docs.size > 0) {
        await deleteAll(db, docs.docs.map((d) => d.ref))
      }
    }
  }

  const itemsSnap = await db.collection('items').get()
  const orphanItems = itemsSnap.docs.filter((d) => !liveIds.has(d.data().collectionId))
  console.log(`  orphaned items: ${orphanItems.length}`)
  if (apply && orphanItems.length > 0) {
    await deleteAll(db, orphanItems.map((d) => d.ref))
  }

  console.log('\nSummary')
  console.log(`  Collections listed:      ${refs.length} (${liveIds.size} live)`)
  console.log(`  Phantom parents:         ${phantoms.length}`)
  console.log(`  ${(apply ? 'Subcollection docs deleted:' : 'Subcollection docs to delete:')} ${phantomDocsDeleted}`)
  console.log(`  ${(apply ? 'Orphan items deleted:' : 'Orphan items to delete:')} ${orphanItems.length}`)
  if (!apply) console.log('\nDry run: nothing was written. Re-run with --apply to delete.')
}

async function deleteAll(db, docRefs) {
  for (let i = 0; i < docRefs.length; i += 500) {
    const batch = db.batch()
    docRefs.slice(i, i + 500).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message ?? String(err)}`)
  process.exit(1)
})
