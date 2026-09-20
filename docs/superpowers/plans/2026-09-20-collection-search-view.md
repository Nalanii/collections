# Collection View: Search Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the collection detail screen: opening a collection loads all its items instantly (no loading spinner), lets the user fuzzy-filter in real time via Fuse.js, switch between All/ISO sub-tabs, and see Have vs. ISO entries visually distinguished by color.

**Architecture:** A pure `searchItems` utility wraps Fuse.js for typo-tolerant fuzzy filtering, independent of React. A new `subscribeToItems` service (mirroring `subscribeToCollection`'s `onSnapshot` pattern) streams the collection's `items` docs. A new `CollectionView` component composes both: it subscribes to the collection doc (for `fieldDefs`/name/emoji) and to items, filters by the active tab then by the search query, and renders a colored list. `App.jsx` gains a third screen state so clicking a Home card opens `CollectionView`.

**Tech Stack:** React 19 + Vite, Firebase/Firestore (`firebase` v12), Fuse.js (new dependency) for fuzzy search, Vitest for the pure-utility unit tests, plain per-component CSS using the tokens in `src/index.css`.

**Spec:** `docs/superpowers/specs/2026-09-20-thrift-collections-design.md` (see "Screens" #3 "Collection view" and ticket 6 in "Ticket breakdown")

## Global Constraints

- Search is Fuse.js, client-side, run against the full collection loaded entirely on collection open — no pagination, no loading spinner for the items list (spec "Architecture" and "Goals").
- Have vs. ISO entries must be visually distinguished **by color**, not just icon/label — v1 requirement, not a stub (spec "Screens" #3, issue #6).
- Reuse the existing palette tokens for that coloring: `--color-accent-green` (`#387e3f`) for Have, `--color-accent-purple` (`#49326b`) for ISO, both already defined in `src/index.css`. Do not invent new colors (issue #6 comment).
- `items/{itemId}` is a **top-level** Firestore collection (not nested under `collections/{id}`), with a `collectionId` field — query it with `where('collectionId', '==', id)` (confirmed by `firestore.rules` lines 77-83 and the spec's data model).
- Item shape: `{ collectionId, status: "have" | "iso", notes, fields: { ...per fieldDefs }, createdBy, createdAt, updatedAt }`.
- All Firebase calls live in `src/services/` (thin service layer), never directly in components (spec "Architecture").
- Do **not** build the add-mode toggle, add-item form, or edit/delete affordances — that is ticket 7 (issue #6 explicitly excludes it: "the toggle into add mode is built in #7").
- Do **not** build read-only banners/enforcement — that is ticket 10.
- Plain JS/JSX (this codebase has no TypeScript despite the spec's data-model pseudo-types) — match existing files' style exactly (no semicolons, single quotes, 2-space indent, as seen in `src/components/Home.jsx` and `src/services/collections.js`).
- Lint with `oxlint` must stay clean (`npm run lint`).

---

## File Structure

- `src/utils/itemSearch.js` (new) — pure Fuse.js wrapper: `searchItems(items, fieldDefs, query)`.
- `src/utils/itemSearch.test.js` (new) — Vitest unit tests for the above.
- `src/services/items.js` (new) — `subscribeToItems(collectionId, callback)`, mirrors `src/services/collections.js`'s `subscribeToCollection`.
- `src/components/CollectionView.jsx` (new) — the screen component.
- `src/components/CollectionView.css` (new) — its styles.
- `src/App.jsx` (modify) — add a third screen state to show `CollectionView`.
- `src/components/Home.jsx` (modify) — make collection cards clickable, opening `CollectionView`.
- `src/components/Home.css` (modify) — cursor affordance for the now-clickable card.
- `package.json` / `package-lock.json` (modify) — add the `fuse.js` dependency.

---

### Task 1: Fuzzy search utility

**Files:**
- Create: `src/utils/itemSearch.js`
- Test: `src/utils/itemSearch.test.js`
- Modify: `package.json` (add `fuse.js` dependency)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `searchItems(items, fieldDefs, query)` — exported function. `items` is an array of `{ id, collectionId, status, notes, fields, createdBy, createdAt, updatedAt }`. `fieldDefs` is an array of `{ name, type }`. `query` is a string. Returns an array (subset/reorder of `items`): the full `items` array unchanged when `query.trim() === ''`, otherwise the Fuse.js fuzzy-matched subset in relevance order. Later tasks (Task 2) import this from `'../utils/itemSearch'`.

- [ ] **Step 1: Install Fuse.js**

Run: `npm install fuse.js`

This adds `fuse.js` to `dependencies` in `package.json` and updates `package-lock.json`.

- [ ] **Step 2: Write the failing tests**

Create `src/utils/itemSearch.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { searchItems } from './itemSearch'

const fieldDefs = [
  { name: 'Title', type: 'text' },
  { name: 'Artist', type: 'text' },
]

const items = [
  {
    id: '1',
    status: 'have',
    notes: 'Signed copy',
    fields: { Title: 'Rumours', Artist: 'Fleetwood Mac' },
  },
  {
    id: '2',
    status: 'iso',
    notes: '',
    fields: { Title: 'Nevermind', Artist: 'Nirvana' },
  },
  {
    id: '3',
    status: 'have',
    notes: 'Looking for a reissue with different notes text',
    fields: { Title: 'Abbey Road', Artist: 'The Beatles' },
  },
]

describe('searchItems', () => {
  it('returns every item unchanged when the query is empty', () => {
    expect(searchItems(items, fieldDefs, '')).toEqual(items)
  })

  it('returns every item unchanged when the query is only whitespace', () => {
    expect(searchItems(items, fieldDefs, '   ')).toEqual(items)
  })

  it('matches an exact field value', () => {
    const result = searchItems(items, fieldDefs, 'Nevermind')
    expect(result.map((item) => item.id)).toEqual(['2'])
  })

  it('matches a near-miss typo of a field value (fuzzy, typo-tolerant)', () => {
    const result = searchItems(items, fieldDefs, 'Rumors')
    expect(result.map((item) => item.id)).toContain('1')
  })

  it('matches against notes, not just the defined fields', () => {
    const result = searchItems(items, fieldDefs, 'reissue')
    expect(result.map((item) => item.id)).toEqual(['3'])
  })

  it('returns an empty array when nothing matches', () => {
    const result = searchItems(items, fieldDefs, 'zzzzzzzzzzzzzzzzzzzz')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/utils/itemSearch.test.js`
Expected: FAIL — `itemSearch.js` does not exist yet (`Cannot find module './itemSearch'` or similar).

- [ ] **Step 4: Write the implementation**

Create `src/utils/itemSearch.js`:

```js
import Fuse from 'fuse.js'

const FUSE_OPTIONS = {
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1,
}

// Fuzzy-filters `items` against `query` across each field defined in
// `fieldDefs` plus `notes`, generously typo-tolerant so a near-miss still
// surfaces a match. Returns `items` unchanged (same order) when `query` is
// empty/whitespace-only, so callers can render the full list without a
// separate "no query" branch.
export function searchItems(items, fieldDefs, query) {
  const trimmed = query.trim()
  if (trimmed === '') {
    return items
  }

  const keys = [...fieldDefs.map((fieldDef) => `fields.${fieldDef.name}`), 'notes']
  const fuse = new Fuse(items, { ...FUSE_OPTIONS, keys })
  return fuse.search(trimmed).map((result) => result.item)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/utils/itemSearch.test.js`
Expected: PASS, all 6 tests green.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors in `src/utils/itemSearch.js` or `src/utils/itemSearch.test.js`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/utils/itemSearch.js src/utils/itemSearch.test.js
git commit -m "Add Fuse.js-backed fuzzy item search utility"
```

---

### Task 2: Items service and CollectionView screen

**Files:**
- Create: `src/services/items.js`
- Create: `src/components/CollectionView.jsx`
- Create: `src/components/CollectionView.css`

**Interfaces:**
- Consumes: `searchItems(items, fieldDefs, query)` from `../utils/itemSearch` (Task 1). `subscribeToCollection(collectionId, callback)` from `../services/collections` (existing — callback receives `(data, err)`, `data` is `{ id, name, emoji, ownerId, fieldDefs, createdAt, ... }` or `null`).
- Produces:
  - `subscribeToItems(collectionId, callback)` from `src/services/items.js` — same `onSnapshot` shape as `subscribeToCollection`: `callback` is invoked as `callback(items, error)`. On success `items` is an array of `{ id, ...itemDoc }` and `error` is `undefined`. On a listener error, `items` is `[]` and `error` is the Firestore error.
  - `CollectionView` component from `src/components/CollectionView.jsx`, default export style matches existing components (named export): `export function CollectionView({ collectionId, onBack })`. Task 3 renders `<CollectionView collectionId={...} onBack={...} />`.

- [ ] **Step 1: Write `src/services/items.js`**

No test file for this step — the codebase's only Firestore-service tests are the rules-unit-tests in `tests/firestore.rules.test.js`; `src/services/collections.js` (the pattern this mirrors) has no unit tests either, since exercising `onSnapshot` requires the emulator. Manual verification happens when `CollectionView` is tested in the browser in the next step.

```js
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase'

// `callback` is invoked as `callback(items, error)`. On a successful
// snapshot, `items` is an array of `{ id, ...itemDoc }` for every item
// whose `collectionId` field matches `collectionId`, and `error` is
// undefined. `items` is a top-level Firestore collection (not nested under
// `collections/{id}`), so membership is enforced by firestore.rules'
// isMember(resource.data.collectionId) check rather than by document path.
// On a listener error (e.g. `permission-denied`), `items` is `[]` and
// `error` is the Firestore error.
export function subscribeToItems(collectionId, callback) {
  const itemsQuery = query(collection(db, 'items'), where('collectionId', '==', collectionId))
  return onSnapshot(
    itemsQuery,
    (snapshot) => {
      callback(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })))
    },
    (error) => {
      callback([], error)
    }
  )
}
```

- [ ] **Step 2: Write `src/components/CollectionView.jsx`**

```jsx
import { useEffect, useMemo, useState } from 'react'
import { subscribeToCollection } from '../services/collections'
import { subscribeToItems } from '../services/items'
import { searchItems } from '../utils/itemSearch'
import './CollectionView.css'

export function CollectionView({ collectionId, onBack }) {
  const [collectionData, setCollectionData] = useState(null)
  const [collectionError, setCollectionError] = useState(null)
  const [items, setItems] = useState(null)
  const [itemsError, setItemsError] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    setCollectionError(null)
    const unsubscribe = subscribeToCollection(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setCollectionError('Could not load this collection. Please try again.')
        return
      }
      setCollectionData(data)
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    setItemsError(null)
    const unsubscribe = subscribeToItems(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setItemsError('Could not load items. Please try again.')
        return
      }
      setItems(data)
    })
    return unsubscribe
  }, [collectionId])

  const fieldDefs = collectionData?.fieldDefs ?? []

  const tabItems = useMemo(() => {
    if (items == null) {
      return []
    }
    return activeTab === 'iso' ? items.filter((item) => item.status === 'iso') : items
  }, [items, activeTab])

  const displayedItems = useMemo(
    () => searchItems(tabItems, fieldDefs, query),
    [tabItems, fieldDefs, query]
  )

  if (collectionError) {
    return (
      <div className="collection-view-screen">
        <p className="collection-view-error">{collectionError}</p>
        <button type="button" className="collection-view-back-button" onClick={onBack}>
          ‹ Back
        </button>
      </div>
    )
  }

  if (collectionData === null) {
    return null
  }

  return (
    <div className="collection-view-screen">
      <div className="collection-view-header">
        <button
          type="button"
          className="collection-view-back-button"
          onClick={onBack}
          aria-label="Back to collections"
        >
          ‹
        </button>
        <span className="collection-view-emoji">{collectionData.emoji}</span>
        <span className="collection-view-name">{collectionData.name}</span>
      </div>

      <div className="collection-view-search">
        <input
          type="text"
          className="collection-view-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search…"
          aria-label="Search items"
        />
        {query !== '' && (
          <button
            type="button"
            className="collection-view-clear-button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      <div className="collection-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'all'}
          className={`collection-view-tab${activeTab === 'all' ? ' collection-view-tab--active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'iso'}
          className={`collection-view-tab${activeTab === 'iso' ? ' collection-view-tab--active' : ''}`}
          onClick={() => setActiveTab('iso')}
        >
          ISO
        </button>
      </div>

      {itemsError && <p className="collection-view-error">{itemsError}</p>}

      {items !== null && !itemsError && tabItems.length === 0 && (
        <p className="collection-view-empty">
          {activeTab === 'iso' ? 'No ISO items yet.' : 'No items yet.'}
        </p>
      )}

      {items !== null && !itemsError && tabItems.length > 0 && displayedItems.length === 0 && (
        <p className="collection-view-empty">No items match your search.</p>
      )}

      {displayedItems.length > 0 && (
        <ul className="collection-view-list">
          {displayedItems.map((item) => {
            const fieldsSummary = fieldDefs
              .map((fieldDef) => item.fields?.[fieldDef.name])
              .filter((value) => value !== undefined && value !== null && value !== '')
              .join(' · ')
            return (
              <li key={item.id} className={`item-row item-row--${item.status}`}>
                <div className="item-row-main">
                  <span className="item-row-fields">{fieldsSummary}</span>
                  <span className="item-row-status">{item.status === 'have' ? 'Have' : 'ISO'}</span>
                </div>
                {item.notes && <p className="item-row-notes">{item.notes}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

Notes for the implementer:
- No "Loading…" text is shown for `items` (only a blank list area until the first snapshot arrives) — this is intentional per the Global Constraints (`items` load with zero visible loading state). The `collectionData === null` early return (blank screen while the collection doc's own fast, cheap fetch resolves) mirrors this same "no spinner" philosophy; it is not a spinner or loading message, just nothing rendered yet.
- `item.status` is always `'have'` or `'iso'` per the data model — the className interpolation `item-row--${item.status}` intentionally produces exactly `item-row--have` or `item-row--iso`, which Step 3's CSS targets by those exact class names.

- [ ] **Step 3: Write `src/components/CollectionView.css`**

```css
.collection-view-screen {
  position: relative;
  min-height: calc(100vh - 8rem);
  padding-bottom: 2rem;
}

.collection-view-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.collection-view-back-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.collection-view-emoji {
  font-size: 1.5rem;
  line-height: 1;
}

.collection-view-name {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.collection-view-search {
  position: relative;
  margin-bottom: 0.75rem;
}

.collection-view-search-input {
  width: 100%;
  padding: 0.65rem 2.25rem 0.65rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 1rem;
}

.collection-view-clear-button {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background-color: transparent;
  color: var(--color-text-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.collection-view-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.collection-view-tab {
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background-color: var(--color-surface);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.collection-view-tab--active {
  border-color: var(--color-primary);
  background-color: var(--color-primary);
  color: #ffffff;
}

.collection-view-error,
.collection-view-empty {
  margin-top: 2rem;
  text-align: center;
  color: var(--color-text-muted);
}

.collection-view-error {
  color: var(--color-primary-dark);
}

.collection-view-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.item-row {
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-md);
  border-left: 4px solid transparent;
  background-color: var(--color-surface);
}

.item-row--have {
  border-left-color: var(--color-accent-green);
  background-color: rgba(56, 126, 63, 0.08);
}

.item-row--iso {
  border-left-color: var(--color-accent-purple);
  background-color: rgba(73, 50, 107, 0.08);
}

.item-row-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.item-row-fields {
  font-weight: 600;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

.item-row-status {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.item-row--have .item-row-status {
  color: var(--color-accent-green);
}

.item-row--iso .item-row-status {
  color: var(--color-accent-purple);
}

.item-row-notes {
  margin: 0.3rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors in `src/services/items.js`, `src/components/CollectionView.jsx`, `src/components/CollectionView.css`.

- [ ] **Step 5: Commit**

```bash
git add src/services/items.js src/components/CollectionView.jsx src/components/CollectionView.css
git commit -m "Add items Firestore service and CollectionView search screen"
```

---

### Task 3: Wire CollectionView into navigation

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Home.jsx`
- Modify: `src/components/Home.css`

**Interfaces:**
- Consumes: `CollectionView` component (`{ collectionId, onBack }`) from `src/components/CollectionView.jsx` (Task 2).
- Produces: nothing further downstream — this is the final task in the plan.

- [ ] **Step 1: Add a click handler to Home's collection cards**

In `src/components/Home.jsx`, change the `Home` function signature and the card's opening tag:

Replace:

```jsx
export function Home({ user, onCreateCollection }) {
```

with:

```jsx
export function Home({ user, onCreateCollection, onOpenCollection }) {
```

Replace:

```jsx
            <div key={c.id} className="collection-card">
```

with:

```jsx
            <div
              key={c.id}
              className="collection-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenCollection(c.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenCollection(c.id)
                }
              }}
            >
```

- [ ] **Step 2: Add a pointer cursor to the now-clickable card**

In `src/components/Home.css`, add `cursor: pointer;` to the existing `.collection-card` rule:

```css
.collection-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1.25rem 0.75rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  text-align: center;
  cursor: pointer;
}
```

- [ ] **Step 3: Add the CollectionView screen state to App.jsx**

Replace the full contents of `src/App.jsx` with:

```jsx
import { useState } from 'react'
import './App.css'
import { Admin } from './components/Admin'
import { CollectionView } from './components/CollectionView'
import { Home } from './components/Home'
import { SignIn } from './components/SignIn'
import { useAuth } from './hooks/useAuth'
import { signOutUser } from './services/auth'

function App() {
  const { user, initializing } = useAuth()
  const [adminCollectionId, setAdminCollectionId] = useState(undefined)
  const [openCollectionId, setOpenCollectionId] = useState(null)

  if (initializing) {
    return <div className="app-shell app-shell--loading" />
  }

  if (!user) {
    return (
      <div className="app-shell">
        <SignIn />
      </div>
    )
  }

  const showAdmin = adminCollectionId !== undefined
  const showCollectionView = !showAdmin && openCollectionId !== null

  let content
  if (showAdmin) {
    content = (
      <Admin
        key={adminCollectionId ?? 'new'}
        user={user}
        collectionId={adminCollectionId}
        onDone={() => setAdminCollectionId(undefined)}
      />
    )
  } else if (showCollectionView) {
    content = (
      <CollectionView
        key={openCollectionId}
        collectionId={openCollectionId}
        onBack={() => setOpenCollectionId(null)}
      />
    )
  } else {
    content = (
      <Home
        user={user}
        onCreateCollection={() => setAdminCollectionId(null)}
        onOpenCollection={(collectionId) => setOpenCollectionId(collectionId)}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Collections</h1>
        <button type="button" className="sign-out-button" onClick={signOutUser}>
          Sign out
        </button>
      </header>
      <main className="app-main">{content}</main>
    </div>
  )
}

export default App
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification in the browser**

Run: `npm run dev`

1. Sign in, open a collection that has several Have and ISO items (create test items directly in the Firestore console/emulator if none exist yet, using the `items/{itemId}` shape: `{ collectionId, status: "have"|"iso", notes, fields: {...}, createdBy, createdAt, updatedAt }`).
2. Confirm the item list appears immediately with no loading spinner/text.
3. Type a near-miss/typo of an item's field value (e.g. missing or swapped letters) and confirm it still surfaces via fuzzy match.
4. Click the clear button and confirm the full list returns.
5. Switch to the ISO sub-tab and confirm only ISO items show; switch back to All and confirm everything shows again.
6. Visually confirm Have and ISO rows are distinguished by color (green left border/text for Have, purple for ISO), not just the "Have"/"ISO" text label.
7. Click the back button (‹) and confirm it returns to Home.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/Home.jsx src/components/Home.css
git commit -m "Wire CollectionView into app navigation from Home"
```
