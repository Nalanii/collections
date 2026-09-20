# Branding follow-ups (logo + palette rollout)

Tracks branding work not covered by [#15](https://github.com/Nalanii/collections/issues/15)
(the logo/palette swap itself) — either because it isn't captured in any open
ticket, or because the ticket that touched this area is already closed. This
is a plan only; nothing here has been implemented yet.

## Context

The [design spec](../specs/2026-09-20-thrift-collections-design.md) and the
scaffold ticket (#1, closed) both explicitly called custom icon/branding work
out of scope for v1 — the app shipped with a flat-color placeholder icon and
a stub pink/teal palette. #15 replaces that placeholder with the real logo
and its brand colors. The spec's "non-goal" language around branding is now
stale and should be corrected so it doesn't contradict the shipped app.

## Items

1. **Update the design spec's non-goals section.**
   [docs/superpowers/specs/2026-09-20-thrift-collections-design.md](../specs/2026-09-20-thrift-collections-design.md)
   lines ~34–41 and ~161 say "no custom icon/branding work in v1." That's no
   longer true after #15. Reword to reflect that a real logo/palette exists,
   without rewriting the historical scaffold plan doc (that one's a record of
   what was decided at the time, not current state).

2. **Maskable icon variant for Android adaptive icons.**
   The current `logo-192.png`/`logo-512.png` are straight resizes of the
   source art, which bleeds close to the edges (the arrows/drawer). Android
   adaptive icons crop to a circle/squircle and need ~20% safe-zone padding.
   Add a `purpose: "maskable"` icon (logo centered on a padded canvas) to
   `public/manifest.json` alongside the existing `purpose: "any"` ones, or the
   logo will get clipped when installed on Android home screens. Not in any
   ticket.

3. **Social share meta tags (Open Graph / Twitter Card).**
   No `og:image`, `og:title`, or `twitter:card` tags exist in `index.html`.
   Once collections are shareable (#8, invite by email — likely also relevant
   to any future public share link), a link preview with no image/branding
   will look broken. Add basic OG tags pointing at `logo-512.png` (or a
   dedicated wider social card image) when that sharing surface is built.
   Not currently mentioned in #8.

4. **Header logo once a real app shell exists.**
   `App.jsx`'s signed-in header (`app-header`) currently only shows the text
   title "Collections," no logo — the only place the logo is used
   today is the sign-in screen. #5 (home screen cards) is the first ticket
   that builds out real in-app chrome; when that lands, add the logo
   (small, e.g. 32–40px) next to the header title. #5's ticket body doesn't
   mention this — flag it during implementation rather than assuming it's
   covered.

5. **Loading splash state.**
   `app-shell--loading` (`App.jsx`/`App.css`) currently renders as a bare
   colored `<div>` with nothing in it while auth initializes. Now that a real
   logo exists, consider showing it centered during that loading flash
   instead of an empty box. Cosmetic, low priority, not in any ticket.

6. **Have/ISO status coloring should reuse the new accent tokens.**
   #15 added `--color-accent-green` (`#387e3f`) and `--color-accent-purple`
   (`#49326b`) to `src/index.css` as part of the palette pull from the logo,
   anticipating #6's requirement to "visually distinguish Have vs. ISO
   entries by color." #6's ticket body doesn't specify which colors to use —
   whoever implements #6 should reuse these two tokens (or `--color-primary`
   vs. `--color-accent`) rather than inventing new ones, to keep the app on
   one palette. Worth a comment on #6 when that work starts, not urgent now.

7. **README brand mention (optional).**
   `README.md` has no visual/brand section (understandable — it didn't have
   a logo before). Low priority: could add the logo image at the top of the
   README for anyone browsing the repo on GitHub. Not functionally important,
   skip unless doing an otherwise README pass.

## Explicitly not doing

- Not touching `docs/superpowers/plans/2026-09-20-project-scaffold.md` — it's
  a historical record of the scaffold ticket's plan, not living
  documentation; its "no custom icon work" line describes what was true when
  #1 was written and shouldn't be edited after the fact.
- Not chasing full favicon format coverage (e.g. separate `.png` favicons per
  browser) — the existing `.ico` + PNG + apple-touch-icon set from #15
  covers current browser support well enough.
