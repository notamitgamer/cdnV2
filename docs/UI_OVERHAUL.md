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

- [ ] **1. Foundation (no visual change)** - shared `base.html`, CSS to `static/app.css`, JS to `static/app.js`,
      one token set, legacy aliases and `!important` removed, `index.html` split into per-page partials.
- [ ] **2. Design system** - type/spacing scale, accent, radius, light/dark/system toggle.
- [ ] **3. Components** - navbar, listing (file-type icons, sort, density), file previews, upload queue,
      toasts, accessible dialogs, docs/sync code blocks, 404/empty states.
- [ ] **4. Polish** - a11y pass, mobile pass, manifest/OG fixes, SRI for Turbo, configurable site name.

## Safety rule for previews

Uploaded HTML/SVG is never rendered inline on the main origin. It is shown as source text only.
