// Minimal Google Drive v3 client for backup-firestore.js (issue #53).
// Uses OAuth (user refresh token, drive.file scope) over plain fetch: service
// accounts have no storage quota on personal Drives, so they cannot upload.
// drive.file only exposes files this app created, so the backup folder is
// created by scripts/backup-drive-auth.js rather than by hand.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

async function check(res, what) {
  if (res.ok) return res
  throw new Error(`Drive ${what} failed: ${res.status} ${await res.text()}`)
}

export async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await check(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    }),
    'token refresh',
  )
  return (await res.json()).access_token
}

export async function createFolder(token, name, parentId) {
  const res = await check(
    await fetch(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    }),
    'create folder',
  )
  return (await res.json()).id
}

export async function uploadJson(token, name, content, parentId) {
  const boundary = `b${Date.now()}${Math.random().toString(16).slice(2)}`
  const meta = JSON.stringify({ name, parents: [parentId], mimeType: 'application/json' })
  const body =
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\ncontent-type: application/json\r\n\r\n${content}\r\n--${boundary}--`
  const res = await check(
    await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    }),
    `upload ${name}`,
  )
  return (await res.json()).id
}

// Dump folders (firestore-*) directly under the backup folder, with createdTime.
export async function listDumpFolders(token, parentId) {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name contains 'firestore-'`
  const folders = []
  let pageToken
  do {
    const url = new URL(`${API}/files`)
    url.search = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,createdTime)',
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    })
    const data = await (await check(await fetch(url, { headers: { authorization: `Bearer ${token}` } }), 'list')).json()
    folders.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return folders
}

export async function trashFile(token, id) {
  await check(
    await fetch(`${API}/files/${id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    }),
    'trash',
  )
}

// Trash (recoverable for 30 days) dump folders older than keepDays.
export async function pruneDrive(token, parentId, keepDays, now = new Date()) {
  if (keepDays <= 0) return []
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000
  const removed = []
  for (const f of await listDumpFolders(token, parentId)) {
    if (/^firestore-\d{4}-/.test(f.name) && new Date(f.createdTime).getTime() < cutoff) {
      await trashFile(token, f.id)
      removed.push(f.name)
    }
  }
  return removed
}
