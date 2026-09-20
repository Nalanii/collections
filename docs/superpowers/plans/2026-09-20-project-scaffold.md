# Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-scaffolded Vite + React app (commit `f2aa153`) to a real Firebase project, add a mobile-first layout shell, and make the app an installable PWA — completing GitHub issue #1.

**Architecture:** React 19 + Vite 8, no heavy component framework, custom mobile-first CSS. All Firebase SDK calls live behind `src/services/firebase.js` so later tickets never import the Firebase SDK directly in components. Firebase Hosting serves the Vite `dist/` build. A hand-written service worker does static-asset caching only (no offline data sync — that's a future ticket).

**Tech Stack:** React 19, Vite 8, `firebase` JS SDK (modular v9+ API), Firebase Hosting/Firestore, plain CSS (custom properties for the palette), a hand-written `public/sw.js` (no `vite-plugin-pwa`).

**Spec:** [docs/superpowers/specs/2026-09-20-thrift-collections-design.md](../specs/2026-09-20-thrift-collections-design.md) — see "Architecture", "PWA", and ticket 1 in "Ticket breakdown". Tracking issue: GitHub issue #1.

## Global Constraints

- Firebase project ID is `collections-tracker-nls` (already created, Firestore database already provisioned in `nam5`).
- Firebase Web App is already registered. Its SDK config (verbatim, use exactly these values):
  ```json
  {
    "apiKey": "AIzaSyEXAMPLE_REDACTED_KEY_REMOVED_FROM_HISTORY",
    "authDomain": "collections-tracker-nls.firebaseapp.com",
    "projectId": "collections-tracker-nls",
    "storageBucket": "collections-tracker-nls.firebasestorage.app",
    "messagingSenderId": "614821018022",
    "appId": "1:614821018022:web:f6f24b3daaec55abfcb767"
  }
  ```
- Firebase Authentication is **not yet enabled** on the project (blocked on the project owner linking a GCP billing account — tracked separately, not this plan's job to unblock). Do not make Auth enablement a blocking step for any task below; `src/services/firebase.js` initializes `getAuth()` regardless — that call succeeds even before the Auth product is "enabled" in the console, it only fails if you actually try to sign in, which is out of scope for this plan (ticket 2).
- All Firebase config values are read from Vite env vars (`import.meta.env.VITE_FIREBASE_*`), never hardcoded in `src/services/firebase.js` — this keeps the file safe to commit and lets CI/deploy supply different values later if ever needed.
- No custom icon/branding work — the PWA manifest icon is a simple flat-color placeholder shape, not a designed logo.
- No offline data sync, no Cloud Functions — out of scope per the spec's non-goals.
- Every task must leave `npm run build` passing (run it as the last step of every task).

---

### Task 1: Firebase service layer + hosting/deploy config

**Files:**
- Create: `src/services/firebase.js`
- Create: `.env.example`
- Create: `.env.local` (gitignored — real values for local dev)
- Modify: `.gitignore` (add `.env.local` if not already covered by the existing `.env*` pattern — check first)
- Create: `firebase.json`
- Create: `.firebaserc`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Modify: `package.json` (add `firebase` dependency, add a `deploy` script)
- Modify: `README.md` (add a "Firebase setup" and "Deploy" section)

**Interfaces:**
- Produces: `src/services/firebase.js` exports three named exports — `app` (the initialized `FirebaseApp`), `auth` (return value of `getAuth(app)`), `db` (return value of `getFirestore(app)`). Later tickets (auth, Firestore reads/writes) import from this file and never call `initializeApp`/`getAuth`/`getFirestore` themselves.

- [ ] **Step 1: Install the Firebase SDK**

Run: `npm install firebase`

- [ ] **Step 2: Check the existing `.gitignore` for env file coverage**

Read `.gitignore` (created by the Vite scaffold). Vite's default `.gitignore` already includes a `*.local` pattern, which covers `.env.local`. If it does not, add this line to `.gitignore`:

```
.env.local
```

- [ ] **Step 3: Create `.env.example`**

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 4: Create `.env.local` with the real values from Global Constraints**

```
VITE_FIREBASE_API_KEY=AIzaSyEXAMPLE_REDACTED_KEY_REMOVED_FROM_HISTORY
VITE_FIREBASE_AUTH_DOMAIN=collections-tracker-nls.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=collections-tracker-nls
VITE_FIREBASE_STORAGE_BUCKET=collections-tracker-nls.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=614821018022
VITE_FIREBASE_APP_ID=1:614821018022:web:f6f24b3daaec55abfcb767
```

- [ ] **Step 5: Create `src/services/firebase.js`**

```js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
```

- [ ] **Step 6: Create `firestore.rules` (default-deny — real rules land in a later ticket)**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 7: Create `firestore.indexes.json`**

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

- [ ] **Step 8: Create `.firebaserc`**

```json
{
  "projects": {
    "default": "collections-tracker-nls"
  }
}
```

- [ ] **Step 9: Create `firebase.json`**

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

- [ ] **Step 10: Add a `deploy` script to `package.json`**

In the `"scripts"` block, add:

```json
"deploy": "npm run build && firebase deploy --only hosting,firestore"
```

- [ ] **Step 11: Document setup and deploy in `README.md`**

Append a new section:

```markdown
## Firebase setup

This app is wired to the Firebase project `collections-tracker-nls`.

1. Copy `.env.example` to `.env.local`.
2. Fill in the values from the Firebase console (Project settings → General →
   Your apps → SDK setup and configuration) or ask a project maintainer for
   them.

## Deploy

```bash
npm run deploy
```

This builds the app and deploys Hosting + Firestore rules/indexes to the
`collections-tracker-nls` Firebase project. Requires the Firebase CLI
(`npm install -g firebase-tools`) and being logged in (`firebase login`).
```

- [ ] **Step 12: Verify `src/services/firebase.js` actually initializes**

`vite build` only bundles files reachable from `index.html`'s import graph, so an unimported `firebase.js` would not be exercised by a build check alone. Verify it directly with the Vite dev server instead: temporarily add `import './services/firebase.js'` as the first line of `src/main.jsx`, run `npm run dev`, open the printed local URL, and confirm the browser console shows no errors (a successful `initializeApp` call throws in the console if the config is malformed). Then remove that import line from `src/main.jsx` — no ticket needs it wired into the app entry point until the auth ticket — and stop the dev server.

- [ ] **Step 13: Run the build**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 14: Commit**

```bash
git add .env.example .gitignore firebase.json .firebaserc firestore.rules firestore.indexes.json package.json package-lock.json README.md src/services/firebase.js
git commit -m "Add Firebase service layer, hosting config, and deploy script"
```

Do NOT commit `.env.local` — confirm `git status` shows it as untracked/ignored before committing.

---

### Task 2: Mobile-first layout shell

**Files:**
- Modify: `src/index.css` (CSS custom properties / design tokens, global reset)
- Modify: `src/App.css` (layout shell styles)
- Modify: `src/App.jsx` (replace the Vite starter content with a minimal app shell)
- Modify: `index.html` (add `theme-color` meta tag)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: CSS custom properties on `:root` — `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-primary`, `--color-primary-dark`, `--color-accent`, `--color-border`, `--radius-md`, `--font-family-base` — later tickets (Home screen, Admin, Collection view) style against these tokens instead of introducing their own colors.

- [ ] **Step 1: Replace `src/index.css` with base tokens and a global reset**

```css
:root {
  --color-bg: #fdf8f3;
  --color-surface: #ffffff;
  --color-text: #3a3238;
  --color-text-muted: #8a8188;
  --color-primary: #ff8fa3;
  --color-primary-dark: #e8637a;
  --color-accent: #8ecfc0;
  --color-border: #efe6dd;
  --radius-md: 12px;
  --font-family-base: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-family-base);
  -webkit-font-smoothing: antialiased;
}

#root {
  min-height: 100vh;
}

button {
  font-family: inherit;
}
```

- [ ] **Step 2: Replace `src/App.css` with the layout shell**

```css
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
}

.app-header {
  padding: 1rem;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.app-header h1 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--color-primary-dark);
}

.app-main {
  flex: 1;
  padding: 1rem;
}
```

- [ ] **Step 3: Replace `src/App.jsx` with a minimal shell**

```jsx
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Thrift Collections</h1>
      </header>
      <main className="app-main">
        <p>Your collections will show up here.</p>
      </main>
    </div>
  )
}

export default App
```

- [ ] **Step 4: Delete now-unused starter assets**

Run:
```bash
git rm src/assets/react.svg src/assets/vite.svg src/assets/hero.png
```

- [ ] **Step 5: Add a `theme-color` meta tag to `index.html`**

In the `<head>`, immediately after the existing `<meta name="viewport" ...>` line, add:

```html
<meta name="theme-color" content="#fdf8f3" />
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 7: Verify at mobile viewport width**

Run: `npm run dev`, open the printed local URL in a browser, resize the viewport (or use device toolbar) to 375px width. Confirm the header and main content render without horizontal scroll and the `.app-shell` stays centered and readable. Stop the dev server after confirming.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add mobile-first layout shell and base color palette"
```

---

### Task 3: PWA manifest + service worker

**Files:**
- Create: `public/manifest.json`
- Create: `public/icon.svg`
- Create: `public/sw.js`
- Modify: `index.html` (link the manifest, register the service worker)
- Modify: `src/main.jsx` (register the service worker on load)

**Interfaces:**
- Consumes: `--color-primary-dark` (`#e8637a`) and `--color-bg` (`#fdf8f3`) token values from Task 2, used as the manifest's `theme_color`/`background_color` so the installed app matches the in-app palette.
- Produces: nothing later tasks in this plan depend on.

- [ ] **Step 1: Create a placeholder icon at `public/icon.svg`**

A simple flat-color rounded square with a centered initial — no custom branding/logo work, just a legible placeholder:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#ff8fa3"/>
  <text x="256" y="330" font-family="system-ui, sans-serif" font-size="260" font-weight="700" fill="#fdf8f3" text-anchor="middle">T</text>
</svg>
```

- [ ] **Step 2: Create `public/manifest.json`**

```json
{
  "name": "Thrift Collections",
  "short_name": "Collections",
  "description": "Track what you have and what's on your wishlist across your collections.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fdf8f3",
  "theme_color": "#e8637a",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "192x192 512x512",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ]
}
```

- [ ] **Step 3: Create `public/sw.js` — static-asset caching only**

```js
const CACHE_NAME = 'collections-static-v1'
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
        }
        return response
      })
    })
  )
})
```

- [ ] **Step 4: Link the manifest and icon in `index.html`**

In the `<head>`, after the `theme-color` meta tag added in Task 2, add:

```html
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/icon.svg" />
```

- [ ] **Step 5: Register the service worker in `src/main.jsx`**

At the bottom of `src/main.jsx` (after the existing `createRoot(...).render(...)` call), add:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: `✓ built` with no errors.

- [ ] **Step 7: Verify installability**

Run: `npm run build && npm run preview`, open the printed local URL in a browser (service workers require a real server, not `npm run dev`'s behavior is fine too but `preview` serves the production build). Open DevTools → Application → Manifest, confirm it loads with no errors and shows the icon/name/colors. Confirm DevTools → Application → Service Workers shows the worker activated. Stop the preview server after confirming.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add PWA manifest and static-asset-caching service worker"
```

---

## Self-Review Notes

- Spec coverage: Hosting/Firestore wiring (Task 1), Auth SDK init deferred to Task 1's `firebase.js` with Auth *product* enablement explicitly called out as out-of-scope in Global Constraints (real sign-in is ticket 2), mobile-first layout + palette (Task 2), PWA manifest + service worker (Task 3), `src/services/` as the Firebase home (Task 1). Deploy pipeline documented as a single command (Task 1, Step 11). No offline sync, no Cloud Functions, no custom icon work — respected in Tasks 1 and 3.
- The `firebase.json` hosting `public` points at `dist` (Vite's default build output) — confirmed against `vite.config.js`, which has no custom `build.outDir`.
