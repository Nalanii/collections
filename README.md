# Collections

A mobile-first, personal collection tracker: define collections (DVDs, vinyl,
whatever), log what you Have vs. what's on your wishlist, and search fast so
you don't buy duplicates. See the full design spec at
[docs/superpowers/specs/2026-09-20-thrift-collections-design.md](docs/superpowers/specs/2026-09-20-thrift-collections-design.md).

## Getting started

Requirements: Node.js, and the [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`) if you plan to deploy.

```bash
npm install
cp .env.example .env.local
# fill in .env.local with your Firebase project's SDK config (see "Firebase setup" below)
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
