// One-time helper for issue #53: authorizes the backup script to write to YOUR
// Google Drive and creates the backup folder.
//
// Usage (see docs/backups.md for creating the OAuth client first):
//   DRIVE_CLIENT_ID=... DRIVE_CLIENT_SECRET=... npm run backup-drive-auth
//
// Opens a consent URL, receives the code on http://127.0.0.1:53682 (loopback
// only, state + PKCE checked), then prints DRIVE_REFRESH_TOKEN and
// DRIVE_FOLDER_ID. Store them privately (e.g. a git-ignored .env.backup); never
// commit them.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { DRIVE_SCOPE, check, createFolder, getAccessToken } from './backup-drive-lib.js'

const PORT = 53682
const redirectUri = `http://127.0.0.1:${PORT}`
const clientId = process.env.DRIVE_CLIENT_ID
const clientSecret = process.env.DRIVE_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Set DRIVE_CLIENT_ID and DRIVE_CLIENT_SECRET first.')
  process.exit(1)
}

// CSRF state + PKCE (S256): the callback must echo our state, and the token
// exchange proves possession of the verifier.
const state = randomBytes(32).toString('base64url')
const codeVerifier = randomBytes(32).toString('base64url')
const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: DRIVE_SCOPE,
  access_type: 'offline',
  prompt: 'consent',
  state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
})
console.log(`Open this URL in your browser and approve access:\n\n${authUrl}\n`)

function stateMatches(got) {
  if (got === null) return false
  const a = Buffer.from(got)
  const b = Buffer.from(state)
  return a.length === b.length && timingSafeEqual(a, b)
}

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    let url
    try {
      url = new URL(req.url, redirectUri)
    } catch {
      res.statusCode = 400
      res.end('Bad request.')
      return
    }
    // Stray requests (favicon, scanners, wrong state) must not end the wait.
    if (url.pathname !== '/') {
      res.statusCode = 404
      res.end('Not found.')
      return
    }
    if (!stateMatches(url.searchParams.get('state'))) {
      console.error('Ignored a callback request with a mismatched state.')
      res.statusCode = 400
      res.end('State mismatch; ignoring this request.')
      return
    }
    const error = url.searchParams.get('error')
    const c = url.searchParams.get('code')
    if (!error && !c) {
      res.statusCode = 400
      res.end('No code received.')
      return
    }
    res.end(error ? 'Authorization failed. You can close this tab.' : 'Authorized. You can close this tab.')
    server.close()
    if (error) reject(new Error(`Authorization was not granted: ${error}`))
    else resolve(c)
  })
  server.on('error', (err) => {
    reject(
      new Error(
        err.code === 'EADDRINUSE'
          ? `Port ${PORT} is already in use. Is another backup-drive-auth still running?`
          : String(err.code ?? err.name),
      ),
    )
  })
  server.listen(PORT, '127.0.0.1')
}).catch((err) => {
  // Our own one-liners, or the OAuth error code from a state-verified callback; never the error object or stack.
  console.error(err.message)
  process.exit(1)
})

const tokenRes = await check(
  await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  }),
  'token exchange',
)
const tokens = await tokenRes.json()
if (!tokens.refresh_token) {
  // Never print the response object: it can hold an access_token.
  const detail = [tokens.error, tokens.error_description].filter(Boolean).join(': ')
  console.error(`No refresh token returned.${detail ? ` ${detail}` : ''}`)
  process.exit(1)
}

const access = await getAccessToken({ clientId, clientSecret, refreshToken: tokens.refresh_token })
const folderId = await createFolder(access, 'collections-firestore-backups')

console.log('\nDone. Store these privately:\n')
console.log(`DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`)
console.log(`DRIVE_FOLDER_ID=${folderId}`)
