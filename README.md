# <img src="src/assets/logo-rounded.png" alt="Collections logo" width="32" valign="middle" /> Collections

![React](https://img.shields.io/badge/React-19.2-grey?style=for-the-badge&logo=react&logoColor=black&labelColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-8.3-grey?style=for-the-badge&logo=vite&logoColor=white&labelColor=646CFF)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

A mobile-first, personal collection tracker: define collections (DVDs, vinyl,
whatever), log what you Have vs. what's on your wishlist, and search fast so
you don't buy duplicates.

## Why

Standing in a thrift store, it's hard to remember "do I already own this?"
Collections solves that: build a custom-schema list for whatever you collect,
mark what you Have vs. what's on your wishlist, and search with generous
fuzzy matching so you can check on the spot before you buy a duplicate.

## Features

- 🗂️ Fully custom per-collection schema — define your own fields per
  collection
- 🔍 Fast, real-time fuzzy search (Fuse.js) — no loading spinners once a
  collection is open
- ✅ Track items as Have vs. wishlist
- 👥 Per-collection sharing with viewer/editor roles
- 📱 Mobile-first UI, installable as a PWA
- 🔐 Google sign-in via Firebase Auth

## Requirements

- Node.js
- [Firebase CLI](https://firebase.google.com/docs/cli)
  (`npm install -g firebase-tools`) if you plan to deploy

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env template and fill it in with your Firebase project's SDK
   config (see [Firebase setup](#firebase-setup) below):
   ```bash
   cp .env.example .env.local
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

## Firebase setup

This app is wired to the Firebase project `collections-tracker-nls`.

1. Copy `.env.example` to `.env.local`.
2. Fill in the values from the Firebase console (Project settings → General →
   Your apps → SDK setup and configuration) or ask a project maintainer for
   them.

## Testing

```bash
npm run test:rules
```

Runs the Firestore security rules unit tests (`tests/firestore.rules.test.js`)
against a local Firestore emulator via `firebase emulators:exec`. No manual
emulator startup needed — the emulator is started, the tests run against it,
and it's torn down automatically.

**Troubleshooting:** if `npm run test:rules` fails with a port-8080-in-use
error, `emulators:exec` likely left a stray Firestore emulator (Java) process
running from a previous run that exited uncleanly. Find and kill it, then
re-run:

- Windows: `Get-Process java | Stop-Process -Force` (or end the `java.exe`
  process via Task Manager)
- macOS/Linux: `lsof -ti:8080 | xargs kill`

## Importing from Google Sheets

`scripts/import-sheet.js` bulk-loads a spreadsheet into an **existing**
collection as items.

1. In Google Sheets, open the tab to import and choose **File → Download →
   Comma-separated values (.csv)** (this exports only the current tab).
2. Row 1 must be headers. Headers are matched (case-insensitively) to the
   collection's field names; `Status` (`have` / `iso`, default `have`) and
   `Notes` columns are also recognised. Other headers are reported and skipped
   (or appended to notes with `--unmatched-to-notes`). Empty rows are skipped.
3. Find the collection id (its doc id under `collections` in the Firestore
   console) and your Firebase Auth uid; the uid becomes
   each item's `createdBy`.
4. Preview, then run:

```bash
npm run import-sheet -- <collectionId> path/to/file.csv --uid <uid> --dry-run
npm run import-sheet -- <collectionId> path/to/file.csv --uid <uid>
```

`--uid` can be replaced by the `IMPORT_UID` env var. To try it locally, set
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (with the emulator running) and the
script writes there instead. Without it the script writes to **production**
using Admin credentials (`GOOGLE_APPLICATION_CREDENTIALS` pointing at a
service-account key); the target is printed first. `--project <id>` overrides
the project (default `collections-tracker-nls`). Unit tests for the mapping
logic: `npm run test:unit`.

## Deploy

```bash
npm run deploy
```

This builds the app and deploys Hosting + Firestore rules/indexes to the
`collections-tracker-nls` Firebase project. Requires the Firebase CLI
(`npm install -g firebase-tools`) and being logged in (`firebase login`).

## CI/CD

[`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) runs on every
push and pull request targeting `main`:

- **Test job** (push + PR): `npm ci`, `npm run lint`, `npm run test:rules`
  (Firestore emulator, needs Java — provisioned via `actions/setup-java`),
  `npm run build`.
- **Deploy job** (push to `main` only, after the test job passes): builds and
  deploys Hosting + Firestore rules/indexes to `collections-tracker-nls`,
  same as `npm run deploy`.

### Deploy secret

The deploy job authenticates with a Firebase service account stored in the
repo secret `FIREBASE_SERVICE_ACCOUNT`. To set it up (or rotate it):

1. In the [Firebase console](https://console.firebase.google.com/project/collections-tracker-nls/settings/serviceaccounts/adminsdk),
   generate a new private key for `collections-tracker-nls` and download the
   JSON file.
2. Add it as a GitHub Actions secret:
   ```bash
   gh secret set FIREBASE_SERVICE_ACCOUNT -R Nalanii/collections < path/to/downloaded-key.json
   ```
   (or paste its contents into **Settings → Secrets and variables → Actions**
   on GitHub).
3. Delete the downloaded JSON file locally once it's set.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Lint with oxlint |
| `npm run test:rules` | Run Firestore security rules tests against the emulator |
| `npm run test:unit` | Run import-script unit tests (no emulator needed) |
| `npm run import-sheet` | Import a Google Sheets export into a collection (see above) |
| `npm run deploy` | Build and deploy Hosting + Firestore rules/indexes |

## Project Structure

```
src/
├── assets/       # Images, logo
├── components/   # React components
├── hooks/        # Custom React hooks
├── services/     # Firebase (auth, Firestore) service layer
├── App.jsx
└── main.jsx
tests/            # Firestore security rules tests
docs/             # Design specs and planning docs
```

## License

Private personal project — not licensed for reuse.
