# Collections — Design Spec

**Date:** 2026-09-20
**Status:** Approved for ticket breakdown

## Problem

Standing in a thrift store, it's hard to remember "do I already own this?" This app
is a mobile-first, personal collection tracker: define collections (DVDs, vinyl,
whatever), log what you Have vs. what's on your ISO/wishlist, and search fast
with generous fuzzy matching so you don't buy duplicates. Collections can
optionally be shared (read-only or read/write) with other people.

## Goals

- Mobile-first, minimal, uncluttered UI — usable one-handed in a store aisle.
- Fast, generous, real-time fuzzy search — zero loading spinners once a
  collection is open.
- Fully custom per-collection schema (user-defined fields).
- Per-collection sharing with accept/leave and role-based (viewer/editor)
  permissions.
- Hosted as close to 100% on Firebase as possible.
- Installable as a PWA in v1, with the architecture kept friendly to wrapping
  as a native app later.

## Non-goals (v1)

- Offline support (stubbed as a future ticket).
- Non-Google auth (SimpleLogin, stubbed as a future ticket).
- Ownership transfer for shared collections (stubbed as a future ticket).
- Archiving collections (stubbed as a future ticket — v1 only supports
  straight delete).
- Dedicated "did you mean" UI beyond generous fuzzy filtering.
- Further custom app icon / branding work beyond the shipped logo and
  palette (v1 uses simple, cute, modern, minimal system styling).

## Architecture

- **Frontend:** React + Vite, custom mobile-first responsive CSS (no heavy
  component framework). Visual language: simple, cute, modern, minimal —
  soft/friendly color palette, with the shipped logo and brand palette.
- **Hosting:** Firebase Hosting.
- **Auth:** Firebase Auth, Google provider only for v1.
- **Data:** Firestore.
- **Authorization:** Firestore Security Rules (no Cloud Functions needed —
  invites are plain documents, not emails).
- **Search:** Fuse.js, client-side, run against the full collection (loaded
  entirely on collection open).
- **PWA:** Web app manifest + service worker (static asset caching only, no
  offline data sync) so the app is installable to a phone home screen in v1.
- **Future native-app path:** all Firebase calls (auth, Firestore reads/
  writes) live in a thin service layer (e.g. `src/services/`) rather than
  scattered through components, so the app can be wrapped later (e.g. with
  Capacitor) without a rewrite. No native-specific code in v1 — this is
  purely a "don't box ourselves in" constraint on where Firebase logic lives.

## Data model (Firestore)

```
users/{uid}
  email, displayName, photoURL

collections/{collectionId}
  name, emoji, ownerId, fieldDefs: [{ name, type: "text" | "number" }], createdAt

collections/{collectionId}/members/{uid}
  role: "owner" | "editor" | "viewer", joinedAt

collections/{collectionId}/invites/{email}
  role: "editor" | "viewer", invitedBy, invitedAt

items/{itemId}
  collectionId, status: "have" | "iso", notes, fields: { ...per fieldDefs },
  createdBy, createdAt, updatedAt
```

Security rules gate every read/write on the caller's `members/{uid}` doc for
the target `collectionId`, checking role for write access. Home screen finds
"my collections" via a `collectionGroup("members")` query filtered to
`request.auth.uid`.

## Sharing flow

1. Owner opens Admin for a collection → enters an invitee email + role
   (viewer/editor) → writes `collections/{id}/invites/{email}`.
2. On login, the app checks for invite docs matching the signed-in user's
   email (a `collectionGroup("invites")` query) and surfaces a pending-invites
   inbox.
3. Accepting an invite writes a `members/{uid}` doc with the invited role and
   deletes the invite doc. Declining just deletes the invite doc.
4. Any non-owner member can leave a collection (deletes their own `members`
   doc). The owner cannot leave — only delete the collection.

## Screens

1. **Home** — grid of collection cards (emoji + name). Cards show a "shared
   with me" badge and a "read-only" badge when applicable. An Admin/Settings
   entry point (e.g. floating action button) is always visible.
2. **Admin/Settings** — create/edit a collection: name, emoji picker, field
   definitions (add/remove text or number fields), manage sharing (invite by
   email + role, list current members, revoke access), delete collection.
3. **Collection view** — defaults to **search mode**: real-time fuzzy
   filter/sort over all items, a clear button, and a sub-tab toggle between
   **All** and **ISO**. A small toggle switches to **add mode**: a form built
   from the collection's field defs plus a Have/ISO radio and a notes field.
   Ctrl+Enter saves the entry, clears the form, and refocuses the first input
   for fast repeated entry. Read-only members never see add mode or edit
   affordances, and see a persistent read-only banner/icon. **Have vs. ISO
   entries are visually distinguished by color** (not just a text/icon
   label) in the list, since scanning at a glance is the core use case — v1
   requirement, not a stub.

## Testing approach

- Manual mobile-viewport testing in the browser during implementation of each
  UI ticket.
- Firestore Security Rules get dedicated rules-unit-tests, since they're the
  actual access-control boundary for sharing/permissions.

## Ticket breakdown

This spec is implemented as a sequence of GitHub issues, each independently
shippable and buildable on the last:

1. **Project scaffold** — Vite + React app, Firebase project wiring (Hosting,
   Auth, Firestore), deploy pipeline, base mobile-first layout shell, PWA
   manifest + service worker (installable, static-asset caching only), a
   Firebase service layer (`src/services/`) for auth/Firestore calls.
2. **Google auth** — sign-in/sign-out, `users/{uid}` profile doc on first
   login, route guarding.
3. **Firestore security rules + rules tests** — full rule set for
   `collections`, `members`, `invites`, `items` per the model above, with
   automated rules-unit-tests covering owner/editor/viewer/non-member cases.
4. **Admin: create/edit collection** — name, emoji picker, field definitions
   (text/number), delete collection.
5. **Home screen** — collection cards grid, shared/read-only badges, empty
   state, Admin entry point.
6. **Collection view: search mode** — load full item list on open, real-time
   Fuse.js fuzzy filter, clear button, All/ISO sub-tabs, distinct coloring
   for Have vs. ISO entries in the list.
7. **Collection view: add mode** — dynamic form from field defs, Have/ISO
   radio, notes, Ctrl+Enter rapid-entry flow, edit/delete existing items.
8. **Sharing: invites** — Admin UI to invite by email + role, pending-invites
   inbox on login, accept/decline.
9. **Sharing: membership management** — member list with role in Admin,
   revoke access, leave-collection action for non-owners.
10. **Read-only enforcement in UI** — hide add mode / edit affordances and
    show the read-only banner for viewer-role members, backed by the security
    rules from ticket 3.
11. **(Stub, future) Offline support** — Firestore offline persistence and
    sync so "do I have this" works with no signal.
12. **(Stub, future) Ownership transfer** — let a collection owner hand off
    ownership to another member.
13. **(Stub, future) SimpleLogin auth** — add SimpleLogin as a second auth
    provider alongside Google.
14. **(Stub, future) Archive collections** — archive instead of (or in
    addition to) straight delete, with an archived-collections view.

## Open questions for later (not blocking v1)

- Further custom app icon / branding work beyond the shipped logo, palette,
  and simple/cute/minimal default styling.
- Whether to eventually wrap the PWA natively (e.g. Capacitor) for app-store
  distribution — the service-layer separation in ticket 1 is the only v1
  concession toward this.
