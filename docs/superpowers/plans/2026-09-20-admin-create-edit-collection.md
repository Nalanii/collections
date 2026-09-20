# Admin: Create/Edit Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT create a git worktree or branch for this plan — work directly on the currently checked-out branch (repo owner's global preference overrides the skill's default worktree-isolation step).

**Goal:** Let a signed-in user create a collection (name, emoji, custom text/number field definitions), edit an existing collection they own, and delete a collection they own, from an Admin screen — completing GitHub issue #4.

**Architecture:** New Firestore service functions in `src/services/collections.js` (create/update/delete + a live subscription), a new `Admin` screen component (`src/components/Admin.jsx`) built from a reusable `CollectionForm` component, and minimal navigation wiring in `App.jsx` (the Home screen from ticket #5 doesn't exist yet, so Admin is reached via a simple "New collection" / "Manage" affordance on the current placeholder main screen — this wiring is expected to be replaced when ticket #5 lands).

**Tech Stack:** React 19, Firebase JS SDK (`firebase/firestore`), existing hand-rolled CSS (no component framework, no icon/emoji-picker library — use a small curated emoji grid, consistent with the spec's "no custom icon/branding work in v1" and "custom mobile-first responsive CSS (no heavy component framework)").

**Spec:** [docs/superpowers/specs/2026-09-20-thrift-collections-design.md](../specs/2026-09-20-thrift-collections-design.md) — see "Data model (Firestore)" and ticket 4 in "Ticket breakdown". Tracking issue: GitHub issue #4.

## Global Constraints

- Data model for the `collections` doc (verbatim from spec):
  ```
  collections/{collectionId}
    name, emoji, ownerId, fieldDefs: [{ name, type: "text" | "number" }], createdAt

  collections/{collectionId}/members/{uid}
    role: "owner" | "editor" | "viewer", joinedAt
  ```
- On create: write `collections/{id}` with `name`, `emoji`, `ownerId: currentUser.uid`, `fieldDefs`, `createdAt: serverTimestamp()`, AND a `collections/{id}/members/{uid}` doc for the creator with `role: "owner"`, `joinedAt: serverTimestamp()`. These are two separate document writes (not a subcollection field) per the data model — use a Firestore batched write so both succeed or neither does.

  > **Correction (post-implementation):** This was proven false during implementation. `firestore.rules`' `members/{uid}` owner-bootstrap rule evaluates `get(collections/{id}).data.ownerId == request.auth.uid`, and that `get()` never sees an uncommitted sibling write from the same `writeBatch`/`runTransaction` — rules-side `get()`/`exists()` calls only ever observe already-committed state. So a batched write of both docs fails with `PERMISSION_DENIED` on the members doc, every time, from unseeded state (verified manually against the emulator). The actual implementation in `src/services/collections.js`'s `createCollection` instead does two sequential, separately-awaited `setDoc` calls: the `collections/{id}` doc first, then (only after that write has committed) the `members/{uid}` doc. This is intentional and correct — do not "fix" it back to a batch/transaction. See the comment above `createCollection` in `src/services/collections.js` and the `tests/firestore.rules.test.js` tests `createCollection's sequential create (...) succeeds` and the companion negative test asserting a batched version of the same create fails.

- `firestore.rules` (already implemented, do not modify) requires: the `collections` doc's `ownerId` field must equal `request.auth.uid` on create; the `members/{uid}` doc's `role` must be `'owner'` and match the pattern in the rules' member-create branch (owner uid, doc doesn't already exist, collection's `ownerId` already equals the caller). Order matters: create the `collections/{id}` doc (or include it in the same batch) so the rule's `get()` lookup of `collections/{collectionId}.data.ownerId` sees the right value — a batched write is atomic and satisfies this.

  > **Correction (post-implementation):** As above, a batched write does NOT satisfy this in practice — the rule's `get()` does not see uncommitted writes from the same batch. What actually satisfies the rule is two sequential awaited `setDoc` calls (collection doc committed first, then the members doc), not a batch.
- Editing (`update`) is allowed by the rules for `owner` or `editor` role, but per this issue only owners edit/delete (non-owners never see the controls — UI-level restriction only, rules already enforce it server-side per #3). Only send `name`, `emoji`, `fieldDefs` on update — never let the client change `ownerId`.
- Field definitions: each is `{ name: string, type: "text" | "number" }`. The form must support add/remove of field rows, and require at least one field with a non-empty name before allowing save (per acceptance criteria: "one or more text/number field definitions").
- Emoji picker: a small curated static list of ~24-32 emoji (thrift/collection-flavored: 📀💿📼📚🎮🧸👗👟🎨🖼️🕹️📷🎭🧵🪙🪆⚱️🎲🧩🪅🗂️🏷️📦✨ etc. — pick a reasonable set), rendered as a button grid; clicking one selects it. No text-free-entry emoji input, no external emoji-picker dependency.
- Delete is a straight `deleteDoc` on `collections/{id}` for v1 (archiving is out of scope, ticket #14) — behind a confirmation step in the UI (e.g. a confirm button/dialog) since it's irreversible. Deleting the collection doc alone is sufficient for this ticket; cleaning up the collection's `members`/`invites` subcollection docs and `items` on delete is explicitly out of scope for this ticket (no ticket in the breakdown covers cascade cleanup yet — do not invent it here).
- All new Firestore calls live in `src/services/collections.js` (per the spec's service-layer constraint — no Firestore imports directly in components).
- Follow existing code conventions: function components, named exports, CSS in a sibling `.css` file imported by the component, CSS custom properties from `src/index.css` (`--color-*`, `--radius-md`, etc.) — no new colors invented ad hoc.
- Every task must leave `npm run build` passing (run it as the last step of every task).
- No test framework exists for component/unit tests in this repo (only `tests/firestore.rules.test.js` via the Firestore emulator, unrelated to this feature). Do not introduce a new test framework for this ticket — verify manually via `npm run dev` in the browser per the spec's "Testing approach" (manual mobile-viewport testing during implementation).

---

### Task 1: Collection service layer

**Files:**
- Create: `src/services/collections.js`

**Interfaces:**
- Exports consumed by Task 2's UI:
  - `createCollection(user, { name, emoji, fieldDefs })` → `Promise<string>` (returns new collection id). Performs the batched write described in Global Constraints.
  - `updateCollection(collectionId, { name, emoji, fieldDefs })` → `Promise<void>`. Updates only `name`, `emoji`, `fieldDefs`.
  - `deleteCollection(collectionId)` → `Promise<void>`. Deletes the `collections/{id}` doc only (per Global Constraints scope).
  - `subscribeToCollection(collectionId, callback)` → unsubscribe function. Real-time listener (`onSnapshot`) yielding the collection doc data (or `null` if it doesn't exist), mirroring the pattern in `src/hooks/useAuth.js` (subscribe/unsubscribe shape) and `src/services/auth.js` (module exporting plain async functions around `db`).

- [ ] **Step 1: Implement `createCollection`**

  Use `writeBatch(db)` from `firebase/firestore`: `batch.set(doc(db, 'collections', newId), {...})` and `batch.set(doc(db, 'collections', newId, 'members', user.uid), { role: 'owner', joinedAt: serverTimestamp() })`, then `batch.commit()`. Generate `newId` with `doc(collection(db, 'collections')).id` before building the batch. Collection doc fields: `{ name, emoji, ownerId: user.uid, fieldDefs, createdAt: serverTimestamp() }`.

  > **Correction (post-implementation):** A `writeBatch` here fails `PERMISSION_DENIED` on the members-doc write, every time, from unseeded state — see the Global Constraints correction note above. What was actually implemented: two sequential, separately-awaited `setDoc` calls (collection doc, then members doc, only after the first commits), plus a small retry-with-delay around the second write and an orphan-`collectionId`-carrying error if it still fails after retries. Do not reintroduce a batch/transaction for this write.

- [ ] **Step 2: Implement `updateCollection`, `deleteCollection`, `subscribeToCollection`**

  `updateCollection` uses `updateDoc(doc(db, 'collections', collectionId), { name, emoji, fieldDefs })`. `deleteCollection` uses `deleteDoc(doc(db, 'collections', collectionId))`. `subscribeToCollection` uses `onSnapshot(doc(db, 'collections', collectionId), snap => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null))` and returns the unsubscribe function `onSnapshot` gives back.

- [ ] **Step 3: Verify**

  Run `npm run build` — must pass (no runtime verification needed yet, no UI consumes this until Task 2).

---

### Task 2: Admin screen UI (form, emoji picker, field builder, delete) + navigation wiring

**Files:**
- Create: `src/components/Admin.jsx`
- Create: `src/components/Admin.css`
- Create: `src/components/CollectionForm.jsx`
- Create: `src/components/CollectionForm.css`
- Modify: `src/App.jsx` (navigation wiring)

**Interfaces:**
- Depends on Task 1's `src/services/collections.js` exports (`createCollection`, `updateCollection`, `deleteCollection`, `subscribeToCollection`).
- `CollectionForm` is a controlled presentational component: props `{ initialValues, onSubmit, onCancel, submitLabel }` where `initialValues` is `{ name: '', emoji: '', fieldDefs: [] }` for create or the existing collection's values for edit. It owns its own local form state (name input, emoji grid selection, field-def rows with add/remove), validates (name non-empty, emoji selected, at least one field def with a non-empty name) before calling `onSubmit({ name, emoji, fieldDefs })`.
- `Admin` is the screen component: owns which collection is being edited (if any — `null`/none means "create new"), calls the Task 1 service functions, shows `CollectionForm`, and (only when editing an existing collection) a "Delete collection" control with a confirmation step. Props: `{ user, collectionId, onDone }` where `collectionId` is `null` for create-mode or an existing id for edit-mode, and `onDone` is called after a successful create/update/delete so the caller (`App.jsx`) can navigate away.

- [ ] **Step 1: Build `CollectionForm`**

  Text input for name. Emoji grid: render the curated emoji list (Global Constraints) as a `<button>` per emoji, `aria-pressed`/a `selected` class on the chosen one, clicking sets it as the current selection (single-select). Field-def builder: a list of rows, each with a name text input and a type `<select>` (`text`/`number`), a remove button per row, and an "Add field" button appending a new blank row. Disable submit until validation passes (name non-empty, emoji chosen, ≥1 field with non-empty name); show inline validation messaging rather than blocking silently. Submit button uses `submitLabel` prop text (e.g. "Create collection" / "Save changes"). Cancel button calls `onCancel`.

- [ ] **Step 2: Build `Admin`**

  If `collectionId` is set, call `subscribeToCollection` on mount (`useEffect`) to load `initialValues` for the form (show a loading state until the first snapshot arrives); unsubscribe on unmount. `onSubmit` handler from `CollectionForm`: create-mode calls `createCollection(user, values)`, edit-mode calls `updateCollection(collectionId, values)`; both call `onDone()` on success and show an inline error message on failure (catch + `setState`, don't throw uncaught). Edit-mode only: render a "Delete collection" button below the form that, on click, shows an inline confirm step (e.g. "Are you sure? [Confirm delete] [Cancel]" — not a native `confirm()` dialog, to match the app's existing UI patterns) before calling `deleteCollection(collectionId)` and then `onDone()`.

- [ ] **Step 3: Wire into `App.jsx`**

  `App.jsx` currently renders a static "Your collections will show up here." placeholder in `app-main` when signed in — ticket #5 (Home screen) will replace this. For this ticket, add minimal local state (`useState`) so the signed-in view can show either the placeholder or the `Admin` screen: an "Admin" or "+ New collection" button in the placeholder view sets state to open `Admin` in create-mode (`collectionId: null`); `Admin`'s `onDone` clears that state back to the placeholder view. Edit-mode navigation (opening `Admin` for a specific existing collection) has no entry point yet since there's no collection list UI until ticket #5 — implement `Admin`'s edit-mode capability (it must work given a `collectionId` prop) but it's acceptable that `App.jsx` only exercises create-mode for now; note this in the task report as an expected gap ticket #5 will close, not a defect.

- [ ] **Step 4: Style**

  `Admin.css` / `CollectionForm.css` follow the existing look (`src/App.css`, `src/components/SignIn.css`): `var(--color-*)`, `var(--radius-md)`, mobile-first (component tree lives inside `.app-shell`'s `max-width: 480px` column already, so no new width constraints needed), comfortable tap targets for the emoji grid buttons (min ~44px) since this is a "usable one-handed in a store aisle" mobile app per the spec.

- [ ] **Step 5: Verify**

  Run `npm run build` — must pass. Manually verify in the browser via `npm run dev`: sign in, open Admin, create a collection with two custom fields (one text, one number), confirm it appears in Firestore (via Firebase console or by re-opening Admin in edit-mode for that id if you wire a temporary test path — see note below), edit its emoji and confirm the change persists, delete it and confirm the doc is gone. If there's no live entry point to edit-mode yet (per Step 3's accepted gap), verify edit/delete by temporarily calling `Admin` with a hardcoded `collectionId` during manual testing only (revert before commit) or by checking Firestore directly after create.

---

## Verification Checklist (final)

- [ ] Owner can create a collection with name + emoji + one or more text/number field definitions (writes `collections/{id}` and `collections/{id}/members/{uid}` with `role: "owner"`).
- [ ] Owner can edit an existing collection's name, emoji, and field definitions (via `Admin` in edit-mode).
- [ ] Owner can delete a collection (behind a confirmation step).
- [ ] Non-owner UI concern: not directly testable yet (no membership-list/Home UI exists until later tickets) — rules already enforce it (#3); note as expected, not a gap to fix here.
- [ ] `npm run build` passes.
