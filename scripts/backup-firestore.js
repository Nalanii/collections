// Portable JSON dump of every Firestore document (issue #53).
//
// Walks all top-level collections and their subcollections recursively
// (collections/{id}/members, collections/{id}/invites, items, ...) and writes
// one JSON file per top-level collection into <out>/firestore-<timestamp>/.
// This is a vendor-neutral copy that does not depend on the Firestore export
// format.
//
// Usage:
//   npm run backup-firestore -- [--out <dir>] [--keep-days <n>] [--project <id>] [--no-drive] [--no-auth] [--quiet]
//
// --quiet omits the per-collection user/document counts from stdout (they are
// still in the dump's manifest.json). The Backup workflow passes it because
// Actions logs in a public repo are world-readable (issue #96).
//
// If DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN and
// DRIVE_FOLDER_ID are all set (see scripts/backup-drive-auth.js and
// docs/backups.md), the dump folder is also uploaded to Google Drive and Drive
// dumps older than --keep-days are moved to the Drive trash. Without them the
// dump stays local (or --out can be a locally synced Drive folder).
//
// Defaults: --out backups/, --keep-days 30 (0 disables pruning). Only
// directories named firestore-<timestamp> inside --out are ever pruned. Set
// FIRESTORE_EMULATOR_HOST to target the emulator; otherwise it targets
// PRODUCTION using Admin credentials (GOOGLE_APPLICATION_CREDENTIALS).
// Dump output contains user data: never commit it (backups/ is git-ignored).

import { parseArgs } from 'node:util'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createFolder, getAccessToken, pruneDrive, uploadJson } from './backup-drive-lib.js'
import { DocumentReference, GeoPoint, Timestamp, getFirestore } from 'firebase-admin/firestore'

const DIR_PREFIX = 'firestore-'
const DIR_PATTERN = /^firestore-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/

// Tag non-JSON Firestore types so a dump can be restored losslessly.
export function serialize(value) {
  if (value instanceof Timestamp) return { __type: 'timestamp', value: value.toDate().toISOString() }
  if (value instanceof GeoPoint) return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude }
  if (value instanceof DocumentReference) return { __type: 'reference', path: value.path }
  if (value instanceof Uint8Array) return { __type: 'bytes', base64: Buffer.from(value).toString('base64') }
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]))
  }
  return value
}

const GET_ALL_CHUNK = 300 // refs per getAll() call
const MAX_IN_FLIGHT = 16 // Firestore RPCs in flight across the whole walk (issue #99)

// Tiny FIFO semaphore: limit(fn) runs fn once a slot is free. Wrap only single
// RPCs, never a child dump, or nested recursion would deadlock waiting on slots.
// A released slot is handed straight to the next waiter (active is not
// decremented), so a fresh caller can't barge in and exceed max.
export function createLimiter(max) {
  let active = 0
  const waiting = []
  const release = () => {
    const next = waiting.shift()
    if (next) next()
    else active -= 1
  }
  return async (fn) => {
    if (active >= max) await new Promise((resolve) => waiting.push(resolve))
    else active += 1
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

// listDocuments() includes phantom parents (no fields, only subcollections),
// so nothing reachable is skipped. Snapshots are read in bulk with getAll()
// and subcollections are walked concurrently, both under one shared limiter.
// Output order matches listDocuments()/listCollections(). Returns { docs, count }.
export async function dumpCollection(colRef, limit = createLimiter(MAX_IN_FLIGHT)) {
  const refs = await limit(() => colRef.listDocuments())
  const chunks = []
  for (let i = 0; i < refs.length; i += GET_ALL_CHUNK) chunks.push(refs.slice(i, i + GET_ALL_CHUNK))
  const snaps = (await Promise.all(chunks.map((chunk) => limit(() => colRef.firestore.getAll(...chunk))))).flat()

  let count = 0
  const docs = await Promise.all(
    refs.map(async (ref, i) => {
      const snap = snaps[i]
      const subs = await limit(() => ref.listCollections())
      const dumped = await Promise.all(subs.map((sub) => dumpCollection(sub, limit)))
      const subcollections = {}
      subs.forEach((sub, j) => {
        subcollections[sub.id] = dumped[j].docs
        count += dumped[j].count
      })
      if (snap.exists) count += 1
      return {
        id: ref.id,
        exists: snap.exists,
        data: snap.exists ? serialize(snap.data()) : null,
        subcollections,
      }
    }),
  )
  return { docs, count }
}

export function timestampDirName(date) {
  return DIR_PREFIX + date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
}

function dirNameToDate(name) {
  const m = DIR_PATTERN.exec(name.startsWith(DIR_PREFIX) ? name : '')
  if (!m) return null
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`)
}

export async function prune(outDir, keepDays, now = new Date()) {
  if (keepDays <= 0) return []
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000
  const removed = []
  for (const name of await readdir(outDir)) {
    const date = dirNameToDate(name)
    if (date && date.getTime() < cutoff) {
      await rm(path.join(outDir, name), { recursive: true, force: true })
      removed.push(name)
    }
  }
  return removed
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'backups' },
      'keep-days': { type: 'string', default: '30' },
      project: { type: 'string' },
      'no-drive': { type: 'boolean', default: false },
      'no-auth': { type: 'boolean', default: false },
      quiet: { type: 'boolean', default: false },
    },
  })
  const logCount = values.quiet ? () => {} : console.log
  const keepDays = Number(values['keep-days'])
  if (!Number.isFinite(keepDays) || keepDays < 0) throw new Error('--keep-days must be a number >= 0')

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST
  const projectId =
    values.project ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'collections-tracker-nls'
  initializeApp({ projectId })
  const db = getFirestore()

  console.log(`Target: ${emulatorHost ? `emulator (${emulatorHost})` : `PRODUCTION (${projectId})`}`)

  const now = new Date()
  const dumpDir = path.join(values.out, timestampDirName(now))
  await mkdir(dumpDir, { recursive: true })

  const summary = []
  // Firestore backups don't cover Auth users. listUsers includes passwordHash/
  // salt (if any), so users.json is as sensitive as the rest of the dump.
  // Skipped against the Firestore emulator unless the Auth emulator is set too.
  if (!values['no-auth'] && (!emulatorHost || process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    const users = []
    let pageToken
    do {
      const page = await getAuth().listUsers(1000, pageToken)
      users.push(...page.users.map((u) => u.toJSON()))
      pageToken = page.pageToken
    } while (pageToken)
    await writeFile(path.join(dumpDir, 'auth-users.json'), JSON.stringify({ users }, null, 2))
    summary.push({ collection: 'auth-users', documents: users.length })
    logCount(`  auth-users: ${users.length} user(s)`)
  }
  for (const col of await db.listCollections()) {
    const { docs, count } = await dumpCollection(col)
    await writeFile(path.join(dumpDir, `${col.id}.json`), JSON.stringify({ collection: col.id, docs }, null, 2))
    summary.push({ collection: col.id, documents: count })
    logCount(`  ${col.id}: ${count} document(s)`)
  }
  await writeFile(
    path.join(dumpDir, 'manifest.json'),
    JSON.stringify({ projectId, createdAt: now.toISOString(), collections: summary }, null, 2),
  )

  const removed = await prune(values.out, keepDays, now)
  console.log(`\nWrote ${dumpDir}`)
  if (removed.length > 0) console.log(`Pruned ${removed.length} dump(s) older than ${keepDays} days`)

  const drive = {
    clientId: process.env.DRIVE_CLIENT_ID,
    clientSecret: process.env.DRIVE_CLIENT_SECRET,
    refreshToken: process.env.DRIVE_REFRESH_TOKEN,
  }
  const folderId = process.env.DRIVE_FOLDER_ID
  if (values['no-drive'] || !folderId || !drive.clientId || !drive.clientSecret || !drive.refreshToken) {
    console.log('Drive upload skipped (DRIVE_* env not fully set, or --no-drive).')
    return
  }
  const token = await getAccessToken(drive)
  const remoteDir = await createFolder(token, path.basename(dumpDir), folderId)
  for (const name of await readdir(dumpDir)) {
    await uploadJson(token, name, await readFile(path.join(dumpDir, name), 'utf8'), remoteDir)
  }
  console.log(`Uploaded ${path.basename(dumpDir)} to Drive`)
  const drivePruned = await pruneDrive(token, folderId, keepDays, now)
  if (drivePruned.length > 0) console.log(`Trashed ${drivePruned.length} Drive dump(s) older than ${keepDays} days`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Error: ${err.message ?? String(err)}`)
    process.exit(1)
  })
}
