# UI overhaul

Tracking document for the UI redesign. Scope is templates, CSS and JS; backend changes are limited to
allow-listing the new static files in `app/main.py`.

## Findings that motivated this

- `app/templates/index.html` was an 84 KB monolith rendering seven page types with ~800 lines of inline CSS
  and ~800 lines of inline JS, so every folder page shipped all of it.
- Two CSS layers fought each other: legacy variables aliased onto `--ui-*`, overridden with `!important`.
  Breadcrumb styles were duplicated, and four other templates re-declared their own `:root`.
- The file page had no preview.
- Copy feedback was a 0.8 s border flash; upload errors used `alert()`; dialogs lacked roles, focus
  handling and Esc; no `<main>` or skip link.
- `manifest.json` theme/background (`#000000`) disagreed with the page `theme-color`; `og:image` was relative.

## Constraint: instant folders

Folder pages are built both by Jinja and by `static/fasttree.js` from `_listing.html` macros.
`tests/test_fast_tree.py` asserts they are identical. Listing markup changes go through the macros and the
placeholder contract only.

## Phases

- [x] **1. Foundation** - shared `base.html`, CSS to `static/app.css`, JS to `static/app.js` (both cache-busted with a
      content hash), one token set, legacy aliases and `!important` hacks removed, `index.html` split into
      per-page `_page_*.html` partials, all five templates on one layout. The shared JS now loads on every page
      (before, `/documentation`, `/stats`, etc. had no breadcrumb JS on a direct load).
- [x] **2. Design system** - tokens for surfaces/text/brand/status/file-types, light + dark + system with a persistent
      toggle (applied before first paint, no flash), brand blue accent with the logo's orange as a rare highlight.
- [x] **3. Components** - navbar with a More menu, listing with colour-coded file-type icons and sorting, file page with
      previews (image/video/audio/PDF/text) + labelled link rows + embed snippets, upload queue, toasts, native
      `<dialog>` modals, tabs, empty/404 states.
      (Upload stays a single request per drop so multi-file drops keep their shared batch page; the queue shows
      per-file rows with one shared progress value.)
- [ ] **4. Polish** - a11y pass, mobile pass, manifest/OG fixes, SRI for Turbo, configurable site name.

## Safety rule for previews

Uploaded HTML/SVG is never rendered inline on the main origin. It is shown as source text only.
