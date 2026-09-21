# Collection View: Add Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user in `CollectionView` (built in issue #6) switch into an "add mode" that renders a form built dynamically from the collection's `fieldDefs`, plus a Have/ISO radio (default Have) and a notes field. Ctrl+Enter (or a Save button) saves the item, clears the form, and refocuses the first input for rapid back-to-back entry. Existing items in the list gain edit/delete affordances.

**Architecture:** `src/services/items.js` gains `addItem`, `updateItem`, `deleteItem` alongside the existing `subscribeToItems`, mirroring the create/update/delete style already used in `src/services/collections.js`. `CollectionView` gains a `mode` state (`'search' | 'add'`) with a small toggle; search UI (search box, tabs, list) renders in `'search'` mode, the dynamic form renders in `'add'` mode. Existing item rows in the list gain inline edit/delete buttons — clicking edit populates the add-mode form and switches to it; delete uses a two-step inline confirm (same UX pattern as `Admin.jsx`'s delete-collection confirm). `App.jsx` starts passing `user` into `CollectionView` so new items can record `createdBy`.

**Tech Stack:** React 19 + Vite, Firebase/Firestore (`firebase` v12), plain per-component CSS using the tokens in `src/index.css`.

**Spec:** `docs/superpowers/specs/2026-09-20-thrift-collections-design.md` (see "Screens" #3 "Collection view" and ticket 7 in "Ticket breakdown"), GitHub issue #7.

## Global Constraints

- `items/{itemId}` is a top-level Firestore collection with a `collectionId` field (confirmed by `firestore.rules` lines 77-83). Item shape: `{ collectionId, status: "have" | "iso", notes, fields: { ...per fieldDefs }, createdBy, createdAt, updatedAt }`.
- `firestore.rules`' `items` `update` rule requires `request.resource.data.collectionId == resource.data.collectionId` — `updateItem` must never write a `collectionId` field.
- All Firebase calls live in `src/services/` (thin service layer), never directly in components.
- Ctrl+Enter must save, clear the form, and refocus the first input, per issue #7's acceptance criteria — this only applies when adding a new item, not while editing an existing one (see Task 2 rationale).
- Reuse the existing Have/ISO palette tokens already used for list-row coloring: `--color-accent-green` for Have, `--color-accent-purple` for ISO (`src/index.css`). Do not invent new colors.
- Viewer-role enforcement (hiding add mode / edit-delete from viewers) is issue #10's job, not this one. This ticket must not actively break that later work, but does not need to implement any role checks itself.
- Plain JS/JSX (no TypeScript), matching existing file style exactly: no semicolons, single quotes, 2-space indent (see `src/components/CollectionView.jsx`, `src/services/collections.js`).
- Lint with `oxlint` must stay clean (`npm run lint`).
- No component-testing framework exists in this repo (no `@testing-library/react`, no jsdom) — do not add one. Verification for this plan is manual, in the browser.

---

## File Structure

- `src/services/items.js` (modify) — add `addItem(user, collectionId, { status, fields, notes })`, `updateItem(itemId, { status, fields, notes })`, `deleteItem(itemId)`.
- `src/components/CollectionView.jsx` (modify) — add mode toggle, dynamic add/edit form, Ctrl+Enter handling, edit/delete affordances on item rows.
- `src/components/CollectionView.css` (modify) — styles for the above.
- `src/App.jsx` (modify) — pass `user` into `CollectionView`.

---

### Task 1: Items service — create/update/delete

**Files:**
- Modify: `src/services/items.js`

**Interfaces:**
- Consumes: nothing from other tasks. `db` from `./firebase` (existing import in this file).
- Produces (for Task 2 to import from `../services/items`):
  - `addItem(user, collectionId, { status, fields, notes })` — async, returns the new item's id (string). `user` is `{ uid, ... }` (Firebase Auth user). Writes a new doc to the top-level `items` collection with `collectionId`, `status`, `fields`, `notes`, `createdBy: user.uid`, `createdAt: serverTimestamp()`, `updatedAt: serverTimestamp()`.
  - `updateItem(itemId, { status, fields, notes })` — returns the `updateDoc` promise. Updates only `status`, `fields`, `notes`, `updatedAt: serverTimestamp()` on `items/{itemId}` — never writes `collectionId` (firestore.rules forbids changing it on update).
  - `deleteItem(itemId)` — returns the `deleteDoc` promise for `items/{itemId}`.

- [ ] **Step 1: Add the three functions to `src/services/items.js`**

Add these imports to the existing `import { collection, onSnapshot, query, where } from 'firebase/firestore'` line — change it to:

```js
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
```

Then append these three functions after the existing `subscribeToItems` function (keep `subscribeToItems` exactly as-is):

```js
// Creates a new item doc in the top-level `items` collection. `user` is the
// signed-in Firebase Auth user; `collectionId` is the parent collection this
// item belongs to. `{ status, fields, notes }` matches the item data model:
// `status` is `'have'` or `'iso'`, `fields` is a `{ [fieldDefName]: value }`
// map, `notes` is freeform text. Returns the new item's id.
export async function addItem(user, collectionId, { status, fields, notes }) {
  const docRef = await addDoc(collection(db, 'items'), {
    collectionId,
    status,
    fields,
    notes,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

// Updates an existing item's editable fields. Deliberately never writes
// `collectionId` -- firestore.rules' items/update rule requires
// `request.resource.data.collectionId == resource.data.collectionId`, so
// changing an item's parent collection this way would be rejected anyway.
export function updateItem(itemId, { status, fields, notes }) {
  return updateDoc(doc(db, 'items', itemId), {
    status,
    fields,
    notes,
    updatedAt: serverTimestamp(),
  })
}

export function deleteItem(itemId) {
  return deleteDoc(doc(db, 'items', itemId))
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors in `src/services/items.js`.

- [ ] **Step 3: Commit**

```bash
git add src/services/items.js
git commit -m "Add addItem/updateItem/deleteItem to items service"
```

---

### Task 2: CollectionView add mode, Ctrl+Enter entry, edit/delete affordances

**Files:**
- Modify: `src/components/CollectionView.jsx`
- Modify: `src/components/CollectionView.css`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `addItem`, `updateItem`, `deleteItem` from `../services/items` (Task 1). Existing `subscribeToCollection`, `subscribeToItems`, `searchItems` (unchanged).
- Produces: `CollectionView` now takes a `user` prop in addition to `collectionId` and `onBack`: `export function CollectionView({ collectionId, user, onBack })`. Nothing downstream depends on this beyond `App.jsx`, which this task also updates.

- [ ] **Step 1: Pass `user` into `CollectionView` from `App.jsx`**

In `src/App.jsx`, change:

```jsx
    content = (
      <CollectionView
        key={openCollectionId}
        collectionId={openCollectionId}
        onBack={() => setOpenCollectionId(null)}
      />
    )
```

to:

```jsx
    content = (
      <CollectionView
        key={openCollectionId}
        collectionId={openCollectionId}
        user={user}
        onBack={() => setOpenCollectionId(null)}
      />
    )
```

- [ ] **Step 2: Rewrite `src/components/CollectionView.jsx`**

Replace the full file contents with:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { subscribeToCollection } from '../services/collections'
import { addItem, deleteItem, subscribeToItems, updateItem } from '../services/items'
import { searchItems } from '../utils/itemSearch'
import './CollectionView.css'

const EMPTY_FIELD_DEFS = []

function BackChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M10 3.5L5.5 8l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 2.5v11M2.5 8h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.5 10.5L14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M11 2.5l2.5 2.5-8 8L3 13.5v-2.5l8-8.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3.5 4.5h9M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M6.5 7.5v4M9.5 7.5v4M4.5 4.5l.6 8a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function emptyFormState() {
  return { fields: {}, status: 'have', notes: '' }
}

export function CollectionView({ collectionId, user, onBack }) {
  const [collectionData, setCollectionData] = useState(null)
  const [collectionLoaded, setCollectionLoaded] = useState(false)
  const [collectionError, setCollectionError] = useState(null)
  const [items, setItems] = useState(null)
  const [itemsError, setItemsError] = useState(null)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')

  const [mode, setMode] = useState('search')
  const [form, setForm] = useState(emptyFormState)
  const [editingItemId, setEditingItemId] = useState(null)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const firstFieldRef = useRef(null)

  useEffect(() => {
    setCollectionData(null)
    setCollectionError(null)
    setCollectionLoaded(false)
    const unsubscribe = subscribeToCollection(collectionId, (data, err) => {
      if (err) {
        console.error(err)
        setCollectionError('Could not load this collection. Please try again.')
        return
      }
      setCollectionData(data)
      setCollectionLoaded(true)
    })
    return unsubscribe
  }, [collectionId])

  useEffect(() => {
    setItems(null)
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

  useEffect(() => {
    if (mode === 'add') {
      firstFieldRef.current?.focus()
    }
  }, [mode, focusToken])

  const fieldDefs = collectionData?.fieldDefs ?? EMPTY_FIELD_DEFS

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

  function handleSwitchToAdd() {
    setEditingItemId(null)
    setForm(emptyFormState())
    setFormError(null)
    setMode('add')
    setFocusToken((token) => token + 1)
  }

  function handleSwitchToSearch() {
    setMode('search')
  }

  function handleFieldChange(fieldName, value) {
    setForm((prev) => ({ ...prev, fields: { ...prev.fields, [fieldName]: value } }))
  }

  function handleEditClick(item) {
    setForm({
      fields: Object.fromEntries(
        fieldDefs.map((fieldDef) => [
          fieldDef.name,
          item.fields?.[fieldDef.name] != null ? String(item.fields[fieldDef.name]) : '',
        ])
      ),
      status: item.status,
      notes: item.notes ?? '',
    })
    setEditingItemId(item.id)
    setFormError(null)
    setMode('add')
    setFocusToken((token) => token + 1)
  }

  function handleCancelEdit() {
    setEditingItemId(null)
    setForm(emptyFormState())
    setFormError(null)
    setMode('search')
  }

  async function handleSaveItem() {
    if (saving) {
      return
    }
    const trimmedFields = Object.fromEntries(
      fieldDefs.map((fieldDef) => [fieldDef.name, (form.fields[fieldDef.name] ?? '').trim()])
    )
    const trimmedNotes = form.notes.trim()
    const hasAnyValue = Object.values(trimmedFields).some((value) => value !== '')
    if (!hasAnyValue) {
      setFormError('Fill in at least one field.')
      return
    }
    setFormError(null)
    setSaving(true)
    try {
      if (editingItemId) {
        await updateItem(editingItemId, { status: form.status, fields: trimmedFields, notes: trimmedNotes })
        setEditingItemId(null)
        setForm(emptyFormState())
        setMode('search')
      } else {
        await addItem(user, collectionId, { status: form.status, fields: trimmedFields, notes: trimmedNotes })
        setForm(emptyFormState())
        setFocusToken((token) => token + 1)
      }
    } catch (err) {
      console.error(err)
      setFormError(
        editingItemId ? 'Could not save changes. Please try again.' : 'Could not add item. Please try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  function handleFormSubmit(event) {
    event.preventDefault()
    handleSaveItem()
  }

  function handleFormKeyDown(event) {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault()
      handleSaveItem()
    }
  }

  async function handleConfirmDelete(itemId) {
    setDeletingId(itemId)
    try {
      await deleteItem(itemId)
      setDeleteConfirmId(null)
    } catch (err) {
      console.error(err)
      setItemsError('Could not delete item. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  if (collectionError) {
    return (
      <div className="collection-view-screen">
        <p className="collection-view-error">{collectionError}</p>
        <button type="button" className="collection-view-back-button" onClick={onBack}>
          <BackChevronIcon /> Back
        </button>
      </div>
    )
  }

  if (collectionData === null) {
    if (!collectionLoaded) {
      return null
    }
    return (
      <div className="collection-view-screen">
        <p className="collection-view-error">This collection could not be found.</p>
        <button type="button" className="collection-view-back-button" onClick={onBack}>
          <BackChevronIcon /> Back
        </button>
      </div>
    )
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
          <BackChevronIcon />
        </button>
        <span className="collection-view-emoji">{collectionData.emoji}</span>
        <span className="collection-view-name">{collectionData.name}</span>
      </div>

      <div className="collection-view-mode-toggle" role="tablist" aria-label="Search or add items">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'search'}
          className={`collection-view-mode-button${mode === 'search' ? ' collection-view-mode-button--active' : ''}`}
          onClick={handleSwitchToSearch}
        >
          <SearchIcon /> Search
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'add'}
          className={`collection-view-mode-button${mode === 'add' ? ' collection-view-mode-button--active' : ''}`}
          onClick={handleSwitchToAdd}
        >
          <PlusIcon /> Add
        </button>
      </div>

      {mode === 'add' && (
        <form
          className="collection-view-add-form"
          onSubmit={handleFormSubmit}
          onKeyDown={handleFormKeyDown}
        >
          {fieldDefs.map((fieldDef, index) => (
            <div className="collection-view-add-field" key={fieldDef.name}>
              <label className="collection-view-add-label" htmlFor={`add-field-${fieldDef.name}`}>
                {fieldDef.name}
              </label>
              <input
                id={`add-field-${fieldDef.name}`}
                type={fieldDef.type === 'number' ? 'number' : 'text'}
                className="collection-view-add-input"
                value={form.fields[fieldDef.name] ?? ''}
                onChange={(event) => handleFieldChange(fieldDef.name, event.target.value)}
                ref={index === 0 ? firstFieldRef : undefined}
              />
            </div>
          ))}

          <div className="collection-view-add-field">
            <span className="collection-view-add-label">Status</span>
            <div className="collection-view-status-radio" role="radiogroup" aria-label="Have or ISO">
              <label className="collection-view-status-option collection-view-status-option--have">
                <input
                  type="radio"
                  name="item-status"
                  value="have"
                  checked={form.status === 'have'}
                  onChange={() => setForm((prev) => ({ ...prev, status: 'have' }))}
                  ref={fieldDefs.length === 0 ? firstFieldRef : undefined}
                />
                Have
              </label>
              <label className="collection-view-status-option collection-view-status-option--iso">
                <input
                  type="radio"
                  name="item-status"
                  value="iso"
                  checked={form.status === 'iso'}
                  onChange={() => setForm((prev) => ({ ...prev, status: 'iso' }))}
                />
                ISO
              </label>
            </div>
          </div>

          <div className="collection-view-add-field">
            <label className="collection-view-add-label" htmlFor="add-item-notes">
              Notes
            </label>
            <textarea
              id="add-item-notes"
              className="collection-view-add-textarea"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
            />
          </div>

          {formError && <p className="collection-view-error">{formError}</p>}

          <div className="collection-view-add-actions">
            {editingItemId && (
              <button
                type="button"
                className="collection-view-cancel-edit-button"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
            )}
            <button type="submit" className="collection-view-save-button" disabled={saving}>
              {saving ? 'Saving…' : editingItemId ? 'Update item' : 'Save item'}
            </button>
          </div>

          {!editingItemId && (
            <p className="collection-view-add-hint">Ctrl+Enter saves and starts the next item.</p>
          )}
        </form>
      )}

      {mode === 'search' && (
        <>
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
                  <li
                    key={item.id}
                    className={`collection-view-item-row collection-view-item-row--${item.status}`}
                  >
                    <div className="collection-view-item-row-main">
                      <span className="collection-view-item-row-fields">{fieldsSummary}</span>
                      <span className="collection-view-item-row-status">
                        {item.status === 'have' ? 'Have' : 'ISO'}
                      </span>
                    </div>
                    {item.notes && <p className="collection-view-item-row-notes">{item.notes}</p>}
                    <div className="collection-view-item-row-actions">
                      <button
                        type="button"
                        className="collection-view-item-edit-button"
                        onClick={() => handleEditClick(item)}
                        aria-label="Edit item"
                      >
                        <EditIcon />
                      </button>
                      {deleteConfirmId === item.id ? (
                        <>
                          <button
                            type="button"
                            className="collection-view-item-delete-confirm-button"
                            onClick={() => handleConfirmDelete(item.id)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            className="collection-view-item-delete-cancel-button"
                            onClick={() => setDeleteConfirmId(null)}
                            disabled={deletingId === item.id}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="collection-view-item-delete-button"
                          onClick={() => setDeleteConfirmId(item.id)}
                          aria-label="Delete item"
                        >
                          <DeleteIcon />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
```

Notes for the implementer:
- Field values are always kept as trimmed strings in Firestore (even for `type: 'number'` fields) — this matches how `fieldsSummary` already renders/joins them and how `searchItems` already indexes them (`fields.${fieldDef.name}`) elsewhere in the codebase. Do not introduce `Number()` coercion; that would be new, undiscussed behavior.
- `firstFieldRef` is intentionally attached to whichever control is first in visual order: the first field-def input when `fieldDefs.length > 0`, otherwise the "Have" radio input. This is what gets focused by the `useEffect` on `[mode, focusToken]`.
- Saving an edit returns to `mode === 'search'`; saving a brand-new item stays in `mode === 'add'` with a cleared form and a bumped `focusToken` so `Ctrl+Enter` rapid entry works per the acceptance criteria. This asymmetry is deliberate — issue #7 only asks for rapid-entry behavior on the add flow, not the edit flow.
- The delete confirm is a per-row two-step inline toggle (`deleteConfirmId` holds at most one item id at a time), mirroring `Admin.jsx`'s `confirmingDelete` pattern but scoped per-row instead of per-screen.

- [ ] **Step 3: Append new CSS to `src/components/CollectionView.css`**

Append this to the end of the existing file (do not remove any existing rules):

```css
.collection-view-mode-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.collection-view-mode-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background-color: var(--color-surface);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  min-height: 44px;
}

.collection-view-mode-button--active {
  border-color: var(--color-primary);
  background-color: var(--color-primary);
  color: #ffffff;
}

.collection-view-add-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.collection-view-add-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.collection-view-add-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
}

.collection-view-add-input,
.collection-view-add-textarea {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 1rem;
  min-height: 44px;
}

.collection-view-add-textarea {
  resize: vertical;
}

.collection-view-status-radio {
  display: flex;
  gap: 1rem;
}

.collection-view-status-option {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.collection-view-status-option--have {
  color: var(--color-accent-green);
}

.collection-view-status-option--iso {
  color: var(--color-accent-purple);
}

.collection-view-add-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}

.collection-view-save-button {
  min-height: 44px;
  padding: 0 1.25rem;
  border: none;
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
  color: #ffffff;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.collection-view-save-button:disabled {
  opacity: 0.6;
  cursor: default;
}

.collection-view-cancel-edit-button {
  min-height: 44px;
  padding: 0 1.1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.collection-view-add-hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
  text-align: right;
}

.collection-view-item-row-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.collection-view-item-edit-button,
.collection-view-item-delete-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background-color: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
}

.collection-view-item-delete-button {
  color: var(--color-primary-dark);
}

.collection-view-item-delete-confirm-button,
.collection-view-item-delete-cancel-button {
  min-height: 32px;
  padding: 0 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background-color: var(--color-surface);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.collection-view-item-delete-confirm-button {
  border-color: var(--color-primary-dark);
  background-color: var(--color-primary-dark);
  color: #ffffff;
}
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors in `src/App.jsx`, `src/components/CollectionView.jsx`, `src/components/CollectionView.css`.

- [ ] **Step 5: Manual verification in the browser**

Run: `npm run dev`

1. Sign in and open a collection with at least one text and one number field defined.
2. Click "Add", confirm the form shows one input per field def (matching names/types), a Have/ISO radio defaulted to Have, and a notes field.
3. Type a value into the first field and press Ctrl+Enter. Confirm the item is saved (switch to Search mode and see it in the list), the form is cleared, and the first field is focused again.
4. Repeat for two more items using only the keyboard (Tab/typing/Ctrl+Enter), never touching the mouse.
5. Switch to Search mode, click the edit icon on an existing item, confirm the form populates with its data, change a value, click "Update item", and confirm the change is reflected in the list and the screen returns to Search mode.
6. Click the delete icon on another item, confirm a "Confirm/Cancel" prompt appears inline, click Cancel and confirm nothing is deleted, then click delete again and Confirm — confirm the item disappears from the list.
7. Confirm the mode toggle is easy to find and switching back to Search always works.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/CollectionView.jsx src/components/CollectionView.css
git commit -m "Add collection view add mode with rapid entry and edit/delete"
```
