// One-time helper for issue #53: authorizes the backup script to write to YOUR
// Google Drive and creates the backup folder.
//
// Usage (see docs/backups.md for creating the OAuth client first):
//   DRIVE_CLIENT_ID=... DRIVE_CLIENT_SECRET=... npm run backup-drive-auth
//
// Opens a consent URL, receives the code on http://localhost:53682, then
// prints DRIVE_REFRESH_TOKEN and DRIVE_FOLDER_ID. Store them privately (e.g. a
// git-ignored .env.backup); never commit them.

import http from 'node:http'
import { DRIVE_SCOPE, createFolder, getAccessToken } from './backup-drive-lib.js'

const PORT = 53682
const redirectUri = `http://localhost:${PORT}`
const clientId = process.env.DRIVE_CLIENT_ID
const clientSecret = process.env.DRIVE_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Set DRIVE_CLIENT_ID and DRIVE_CLIENT_SECRET first.')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: DRIVE_SCOPE,
  access_type: 'offline',
  prompt: 'consent',
})
console.log(`Open this URL in your browser and approve access:\n\n${authUrl}\n`)

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, redirectUri)
    const c = url.searchParams.get('code')
    res.end(c ? 'Authorized. You can close this tab.' : 'No code received.')
    server.close()
    if (c) resolve(c)
    else reject(new Error(url.searchParams.get('error') ?? 'no code'))
  })
  server.listen(PORT)
})

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }),
})
const tokens = await tokenRes.json()
if (!tokens.refresh_token) {
  console.error(`No refresh token returned: ${JSON.stringify(tokens)}`)
  process.exit(1)
}

const access = await getAccessToken({ clientId, clientSecret, refreshToken: tokens.refresh_token })
const folderId = await createFolder(access, 'collections-firestore-backups')

console.log('\nDone. Store these privately:\n')
console.log(`DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`)
console.log(`DRIVE_FOLDER_ID=${folderId}`)
