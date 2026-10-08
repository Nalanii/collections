# <img src="src/assets/logo-rounded.png" alt="Collections logo" width="32" valign="middle" /> Collections

![React](https://img.shields.io/badge/React-19.2-grey?style=for-the-badge&logo=react&logoColor=black&labelColor=61DAFB)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8.3-grey?style=for-the-badge&logo=vite&logoColor=white&labelColor=646CFF)
![Node.js](https://img.shields.io/badge/Node.js-24-grey?style=for-the-badge&logo=nodedotjs&logoColor=white&labelColor=5FA04E)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-5.0-grey?style=for-the-badge&logo=vitest&logoColor=white&labelColor=6E9F18)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)

A mobile-first collection tracker: define collections (DVDs, vinyl,
whatever), log what you Have vs. what you're hunting for, share them with
others, and search fast so you don't buy duplicates.

🔥 Live Link: https://collections-tracker-nls.web.app/

## Why

Standing in a thrift store, it's hard to remember "do I already own this?"
Collections solves that: build a custom-schema list for whatever you collect,
mark what you Have vs. what's ISO (in search of), and search with generous
fuzzy matching so you can check on the spot, even with no signal, before you
buy a duplicate.

## Features

- 🗂️ Custom fields per collection (text, number, dropdown). Mark one or two
  primary fields, reorder fields and dropdown options, and add a
  prefix/suffix to show around values on item cards
- 🔍 Real-time, typo-tolerant fuzzy search (Fuse.js) across fields and
  notes, with per-field "exclude from search"
- ✅ Have / ISO tabs and sorting by primary field, A→Z or Z→A (remembered
  per collection)
- ⚡ Fast entry: Ctrl+Enter saves and starts the next item, text fields can
  autocomplete from values already in the collection, and a warning shows
  when a new item's primary fields match an existing one
- 🧹 Standardize values: finds near-duplicate spellings in a text field and
  merges them in one step. Renaming a dropdown option rewrites existing items
- 👥 Share by email invite as editor or viewer. Members can leave, and the
  owner can revoke access or transfer ownership
- 🤝 Concurrent-edit protection: if someone changes an item or collection
  while you're editing it, you can review their version, load it, or
  overwrite it
- 🗄️ Archive a collection to hide it from everyone's home screen (read-only,
  owner can restore). Permanent delete sits behind a confirmation
- 📴 Works offline: cached collections stay searchable, edits queue with a
  pending-change count and sync when you reconnect (see
  [Offline use](#offline-use))
- 🌗 Light and dark themes, following the OS until you pick one
- 📱 Mobile-first UI, installable as a PWA
- 🔐 Sign in with Google or SimpleLogin (Firebase Auth)
- 💾 Daily automated backups of Firestore and Auth users (see
  [Backups](#backups))

## Requirements

- Node.js 24 (what CI runs)
- Java 21+ to run the Firestore emulator for `npm run test:rules` and for
  trying the admin scripts locally
- A Firebase project with Firestore and Authentication enabled (Google
  provider, plus an OIDC provider for SimpleLogin if you want that button).
  The [Firebase CLI](https://firebase.google.com/docs/cli) comes with the
  dev dependencies, so there's nothing to install globally

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env template:
   ```bash
   cp .env.example .env.local
   ```
3. Fill in `.env.local` with your Firebase web app's SDK config (Firebase
   console → Project settings → General → Your apps → SDK setup and
   configuration). `VITE_SIMPLELOGIN_PROVIDER_ID` must match the OIDC
   provider ID registered in Firebase Auth (default `oidc.simple-login`).
4. Start the dev server:
   ```bash
   npm run dev
   ```

The repo is wired to the Firebase project `collections-tracker-nls` via
`.firebaserc`, which deploys and the admin scripts target by default. To
work against your own project, run `npx firebase use <project-id>` and pass
`--project <id>` to the scripts.

## Usage

1. **Sign in** with Google or SimpleLogin.
2. **Create a collection** with the + button on Home: give it a name, an
   optional emoji, and at least one field. Tick one or two fields as
   primary; they're required on every item and make up its title.
3. **Add items** from a collection's **Add** tab. Pick Have or ISO, fill in
   the fields and press **Save item** (or Ctrl+Enter) to save and start the
   next one.
4. **Search** from the **Search** tab. Filter by All / Have / ISO and sort
   by a primary field. Edit or delete items from their cards.
5. **Manage** a collection with the gear icon: edit its fields, invite
   people by email, manage members, standardize values, or archive or
   delete it (owner only). Invites show up on the invitee's Home screen to
   accept or decline.

## Offline use

Firestore's persistent cache keeps your collections available with no
signal: search still works, and items you add, edit or delete are queued
and sync when the device reconnects. A banner shows while you're offline and
counts the changes waiting to sync. If the server later rejects a queued
change (for example, your access was revoked in the meantime), it's
reverted and a message explains why.

Limitations:

- **First load needs a connection.** Data is only cached after it has been
  loaded once while online on that device, so a device that has never
  loaded your account has nothing to show. Open Home once with a signal;
  every collection on your account is then cached.
- **Offline edits skip conflict checks.** Online saves check whether
  someone else changed the same value first. Edits made offline can't, so
  when they sync, edits to different fields of an item merge but the same
  field is last-write-wins.
- **Reloading while offline hides rejections.** A change queued before a
  reload still syncs, but if the server rejects it no message is shown.

## Testing

```bash
npm run test:unit
```

Runs the unit and component tests (utilities, services, React components
via Testing Library, and the admin script logic). No emulator needed.

```bash
npm run test:rules
```

Runs the Firestore security rules tests (`tests/firestore.rules.test.js`)
against a local Firestore emulator via `firebase emulators:exec`, which
starts the emulator, runs the tests and shuts it down again.

**Troubleshooting:** if `npm run test:rules` fails with a port-8080-in-use
error, a previous run probably left a stray Firestore emulator (Java)
process behind. Kill it and re-run:

- Windows: `Get-Process java | Stop-Process -Force` (or end the `java.exe`
  process via Task Manager)
- macOS/Linux: `lsof -ti:8080 | xargs kill`

On Windows this happens on every run if `java` resolves to Oracle's
launcher stub (`C:\Program Files\Common Files\Oracle\Java\javapath\java.exe`),
which is what the Oracle installer puts on PATH. The stub starts the real
JDK `java.exe` as a separate process, and when the Firebase CLI shuts the
emulator down it only kills the stub. The real emulator keeps running,
holding port 8080 and leaving its console window or terminal tab open. Check
with `(Get-Command java).Source`. To fix it, add the JDK's own `bin` folder
(e.g. `C:\Program Files\Java\jdk-26.0.2.1\bin`) to the **system** `Path`
above the `javapath` entry, then restart your terminal. Update that entry
when you upgrade Java, since the folder name includes the version.

## Admin scripts

These Node scripts write with the Firebase Admin SDK. Each one targets the
emulator when `FIRESTORE_EMULATOR_HOST` is set (e.g. `127.0.0.1:8080` with
the emulator running) and otherwise **production**, using the service
account key that `GOOGLE_APPLICATION_CREDENTIALS` points at. The target is
printed first. `--project <id>` overrides the default
`collections-tracker-nls`. Take a backup (`npm run backup-firestore`) before
running any of them against production.

### Importing from Google Sheets

`scripts/import-sheet.js` bulk-loads a spreadsheet into an **existing**
collection as items.

1. In Google Sheets, open the tab to import and choose **File → Download →
   Comma-separated values (.csv)** (this exports only the current tab).
2. Row 1 must be headers. Headers are matched (case-insensitively) to the
   collection's field names; `Status` (`have` / `iso`, default `have`) and
   `Notes` columns are also recognised. Other headers are reported and
   skipped (or appended to notes with `--unmatched-to-notes`). Empty rows
   are skipped.
3. Find the collection id (its doc id under `collections` in the Firestore
   console) and your Firebase Auth uid; the uid becomes each item's
   `createdBy`.
4. Preview, then run:

```bash
npm run import-sheet -- <collectionId> path/to/file.csv --uid <uid> --dry-run
```

```bash
npm run import-sheet -- <collectionId> path/to/file.csv --uid <uid>
```

`--uid` can be replaced by the `IMPORT_UID` env var.

### Trimming existing item whitespace

New and edited items are trimmed automatically. `scripts/trim-item-fields.js`
cleans up items saved before that, trimming leading/trailing whitespace from
field values and notes. It only writes items that change and leaves
`updatedAt` alone. It **writes by default**; add `--dry-run` to preview:

```bash
npm run trim-item-fields -- --dry-run
```

```bash
npm run trim-item-fields -- --collection <collectionId>
```

Omit `--collection` to process every item.

### Cleaning up phantom collections

`scripts/cleanup-phantom-collections.js` removes leftovers from collections
deleted before deletes cascaded: `members`/`invites` subcollections under
collection docs that no longer exist, and items whose collection is gone.
It's a **dry run by default**; add `--apply` to delete:

```bash
npm run cleanup-phantom-collections
```

```bash
npm run cleanup-phantom-collections -- --apply
```

## Backups

Data is protected in four layers: daily scheduled Firestore backups (kept
14 days), point-in-time recovery (7 days), an export of all Firebase Auth
users, and a daily JSON dump of every Firestore document. The Auth export
is written into each daily dump, and the dump is uploaded to a private
Google Drive folder (both kept 30 days).

The dump runs from [`.github/workflows/backup.yml`](.github/workflows/backup.yml)
every day at 08:00 UTC, and on demand from Actions → Backup → Run workflow.
To run it by hand:

```bash
npm run backup-firestore
```

Setup, the Drive OAuth helper (`npm run backup-drive-auth`), required
secrets and restore steps are in [docs/backups.md](docs/backups.md).

## Deployments

### Manual deploy

```bash
npx firebase login
```

```bash
npm run deploy
```

Builds the app and deploys Hosting plus Firestore rules and indexes to
`collections-tracker-nls`.

### CI/CD

[`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) runs on every
push and pull request targeting `main`:

- **Lint & Test** (push + PR): `npm ci`, `npm run lint`,
  `npm run test:unit`, `npm run test:rules` (Java 21 via
  `actions/setup-java`), `npm run build`.
- **Deploy** (push to `main` only, after tests pass): builds with the
  production Firebase config and deploys Hosting plus Firestore
  rules/indexes, same as `npm run deploy`.

### Deploy secrets

The deploy job needs these GitHub Actions secrets:

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
  `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`: the same
  values as `.env.local`, baked into the production build.
- `FIREBASE_SERVICE_ACCOUNT`: a service account key used to deploy. To set
  it up (or rotate it):
  1. In the [Firebase console](https://console.firebase.google.com/project/collections-tracker-nls/settings/serviceaccounts/adminsdk),
     generate a new private key for `collections-tracker-nls` and download
     the JSON file.
  2. Add it as a secret (or paste its contents into **Settings → Secrets
     and variables → Actions** on GitHub):
     ```bash
     gh secret set FIREBASE_SERVICE_ACCOUNT -R Nalanii/collections < path/to/downloaded-key.json
     ```
  3. Delete the downloaded JSON file locally once it's set.

The backup workflow's secrets are listed in
[docs/backups.md](docs/backups.md#automating-the-dump-github-actions).

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Lint with oxlint |
| `npm run test:unit` | Run unit and component tests (no emulator needed) |
| `npm run test:rules` | Run Firestore security rules tests against the emulator |
| `npm run import-sheet` | Import a Google Sheets CSV export into a collection |
| `npm run trim-item-fields` | Trim whitespace from existing items' fields and notes |
| `npm run cleanup-phantom-collections` | Remove orphaned members, invites and items of deleted collections |
| `npm run backup-firestore` | Dump Firestore and Auth users to dated JSON files, uploaded to Drive when configured |
| `npm run backup-drive-auth` | One-time OAuth helper that sets up Drive uploads for backups |
| `npm run deploy` | Build and deploy Hosting plus Firestore rules/indexes |

## Project Structure

```
src/
├── assets/        # Logo and collection icons
├── components/    # React components and their tests
├── hooks/         # Auth, routing, online/sync status, prefetch hooks
├── services/      # Firebase layer: auth, collections, items, invites, sync status
├── utils/         # Search, sorting, permissions, conflict detection, value helpers
├── App.jsx
├── main.jsx
└── theme.js       # Light/dark theme persistence
public/            # PWA manifest, service worker, icons
scripts/           # Admin scripts: import, cleanup, backups
tests/             # Firestore rules tests and admin script tests
docs/              # Backup/restore runbook and design specs
.github/workflows/ # CI/CD and scheduled backup workflows
firestore.rules    # Firestore security rules
```

## License

MIT — see [LICENSE](LICENSE).
