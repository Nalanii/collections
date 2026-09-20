# 📦 Collections

![React](https://img.shields.io/badge/React-19.2-grey?style=for-the-badge&logo=react&logoColor=black&labelColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-8.3-grey?style=for-the-badge&logo=vite&logoColor=white&labelColor=646CFF)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

<img src="src/assets/logo.png" alt="Collections logo" width="120" />

A mobile-first, personal collection tracker: define collections (DVDs, vinyl,
whatever), log what you Have vs. what's on your wishlist, and search fast so
you don't buy duplicates. See the full design spec at
[docs/superpowers/specs/2026-09-20-thrift-collections-design.md](docs/superpowers/specs/2026-09-20-thrift-collections-design.md).

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

## Deploy

```bash
npm run deploy
```

This builds the app and deploys Hosting + Firestore rules/indexes to the
`collections-tracker-nls` Firebase project. Requires the Firebase CLI
(`npm install -g firebase-tools`) and being logged in (`firebase login`).

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Lint with oxlint |
| `npm run test:rules` | Run Firestore security rules tests against the emulator |
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
