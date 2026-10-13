# cdnV2

A small, self-hostable static file host. Browse folders in a clean web UI, upload files, grab direct
links, shorten URLs, and mirror any GitHub repo to the CDN from GitHub Actions — with the files
themselves stored in a [Hugging Face Storage Bucket](https://huggingface.co/docs/hub/storage-buckets),
so the app server stays stateless and cheap to run.

Live instance: <https://cdn.amit.is-a.dev> · License: [MIT](LICENSE)

## Features

- **File browser** — folder listings, per-folder filter (press `/`), breadcrumbs, a recent-uploads and
  visited-files history, and a global search page (`/find`).
- **Direct and raw links** — every file gets a CDN link, a download link, and a raw link served from a
  separate raw domain with correct content types, CORS and long-lived caching.
- **Uploads** — drag-and-drop or paste a URL to fetch. Multi-file uploads get a shareable batch page.
- **Zip downloads** — download any folder or batch as a `.zip` (capped at 300 files / 500 MB).
- **URL shortener** — `/shorten`, with short links served from `/mask/<id>`.
- **GitHub sync** — a GitHub Actions workflow pushes a repo to `/<owner>/<repo>/` using GitHub's OIDC
  token, so no long-lived secret is ever stored in the contributor's repo. See `/gh-sync` for the
  workflow template.
- **Admin dashboard** — `/admin`: upload log, IP bans, GitHub owner allowlist, and file deletion.
- **Abuse protection** — per-IP rate limits, video-upload blocking (by extension and by file contents),
  and optional VPN/proxy blocking.
- **Stats** — `/stats` shows file counts and storage used.
- **Fast navigation** — linked pages are prefetched in the background and cached/gzipped, so a click
  is usually answered from the browser's own cache (details below).
- **PWA** — installable, with a service worker that deliberately caches nothing, so listings are
  never stale.

## How it works

```
 browser / curl ──►  FastAPI app (this repo)  ──►  Hugging Face Storage Bucket
                       │  UI, uploads, rate limits,       (the actual files)
                       │  admin, GitHub OIDC check
                       └─ in-memory cache (60 s) for listings and file metadata
```

The app streams files from the bucket (with HTTP range support) rather than redirecting to it, so your
own domain stays in every link. Hidden prefixes (`_batches`, `_shortened`, `_logs`, `_admin`) hold
internal state and never appear in listings.

## Quick start

You need Python 3.12+ and a Hugging Face access token with **write** access.

```bash
git clone https://github.com/notamitgamer/cdnV2.git
cd cdnV2
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # then edit it: at minimum HF_BUCKET_ID and HF_TOKEN
set -a; . ./.env; set +a

uvicorn app.main:app --reload  # run from the repo root; open http://localhost:8000
```

The bucket is created automatically on first upload if it doesn't exist
(private if `HF_BUCKET_PRIVATE=1`).

The raw domain is matched by hostname. Locally, `raw.localhost` resolves to your machine in most
browsers and in `curl`, which is what `.env.example` uses.

### Docker

```bash
docker build -t cdnv2 .
docker run --rm -p 8000:8000 --env-file .env cdnv2
```

### Deploy on Render

`render.yaml` defines a Docker web service. Set `HF_TOKEN` (and optionally `ADMIN_TOKEN` /
`ADMIN_DATA_KEY`) in the dashboard, and update `HF_BUCKET_ID`, `RAW_DOMAIN` and `RAW_BASE_URL` for your
own deployment. Point two hostnames at the service: the main one and the raw one.

## Configuration

All configuration is through environment variables. See [`.env.example`](.env.example) for a commented
template.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | — | Hugging Face token with write access. **Required.** |
| `HF_BUCKET_ID` | `notamitgamer/cdn` | Bucket that stores the files, as `owner/name`. **Set this.** |
| `HF_BUCKET_PRIVATE` | `0` | Create the bucket as private if it does not exist. |
| `CDN_BASE_URL` | `https://cdn.amit.is-a.dev` | Public URL of the web UI, used when building links. |
| `RAW_DOMAIN` | `raw.cdn.amit.is-a.dev` | Hostname that serves raw files. |
| `RAW_BASE_URL` | `https://$RAW_DOMAIN` | Public base URL for raw links. |
| `OIDC_AUDIENCE` | `cdn.amit.is-a.dev` | Audience GitHub Actions workflows must request. Use your own hostname. |
| `GH_ALWAYS_ALLOW` | `notamitgamer` | Comma-separated GitHub owners that may sync without approval. |
| `ADMIN_TOKEN` | unset | Enables `/admin`. Leave unset to disable the dashboard, bans and allowlist. |
| `ADMIN_DATA_KEY` | `ADMIN_TOKEN` | Key used to encrypt saved admin state in the bucket. |
| `VPN_BLOCK` | `1` | Refuse uploads from VPN/proxy IPs. |
| `VPN_FAIL_OPEN` | `1` | Allow the upload if the VPN lookup itself fails. |
| `PROXYCHECK_KEY` | unset | Optional [proxycheck.io](https://proxycheck.io) key for VPN lookups. |
| `VPN_ALLOWLIST` | unset | Comma-separated IPs exempt from VPN blocking. |
| `TRUST_CF_CONNECTING_IP` | `0` | Trust `CF-Connecting-IP` (set to `1` behind Cloudflare). |
| `TRUSTED_PROXY_HOPS` | `1` | Number of trusted reverse proxies in front of the app. |
| `FAST_TREE_MAX_FILES` | `20000` | Above this many files, `/api/tree` is not shipped and instant folder navigation turns itself off. |

> **Self-hosting checklist:** the defaults above point at the original deployment. Before going live,
> set `HF_BUCKET_ID`, `CDN_BASE_URL`, `RAW_DOMAIN`/`RAW_BASE_URL`, `OIDC_AUDIENCE` and `GH_ALWAYS_ALLOW`
> to your own values, and review the hard-coded branding (`app/static/manifest.json`, the navbar and
> the documentation templates).

### Getting client IPs right

Rate limits and bans are keyed on the client IP, so the app must see the real one. Behind Cloudflare set
`TRUST_CF_CONNECTING_IP=1`; behind other proxies set `TRUSTED_PROXY_HOPS` to the number of proxies you
trust. The admin dashboard shows how the server currently sees your connection.

## HTTP API

| Method & path | Description |
| --- | --- |
| `GET /{path}` | Folder listing or file page. |
| `GET /api/get/{path}` | Download a file (range requests supported). |
| `POST /api/put` | Upload files (`multipart/form-data`: `files`, `folder`). |
| `POST /api/put-url` | Fetch a remote URL into the CDN. |
| `GET /api/find?q=…` | Search all files. |
| `GET /api/tree` | Every file as `[path, size]` (ETag + gzip) for instant folder navigation. |
| `GET /api/shell` | Folder page skeleton + HTML fragments the browser fills in locally. |
| `GET /api/pack/{path}` | Zip a folder (`/api/pack-info/{path}` returns its size first). |
| `POST /api/shorten` | Create a short link. |
| `POST /api/gh-sync` | Sync a GitHub repo (GitHub Actions OIDC token + tar.gz archive). |
| `GET /api/stats` | Storage statistics. |

Uploads go to either `uploads/` or `third-party/`.

Default limits per client IP: 200 MB/hour for file uploads, 50 MB/hour for URL uploads, and 10 requests
per minute / 50 per hour for the shortener. GitHub sync has no rate limit but accepts at most a 200 MB
compressed archive. Video files are refused.

## Fast navigation

Moving around is meant to feel like a static site. Four things work together:

1. **Instant folders.** The browser keeps the whole file tree (`/api/tree`, a few KB gzipped) and a page
   "shell" (`/api/shell`) in localStorage. Clicking a folder link builds that folder's page locally and
   hands it to [Turbo](https://turbo.hotwired.dev), so there is **no request at all**. It works on the very
   first click after a page loads, even before anything has been prefetched, and for returning visitors
   even before the network answers, because last visit's tree is already stored. (`app/static/fasttree.js`)
2. **Link prefetching** for everything else (file pages, other pages). `app/static/prefetch.js` fetches
   the pages linked from the current one as soon as the browser is idle.
3. **Browser-cached, gzipped pages.** Rendered pages are identical for everyone, so they are sent with
   `Cache-Control: private, max-age=30` and gzip (`app/fast_html.py`). A prefetched page is answered from
   the browser's cache; one that wasn't arrives about 5x smaller. The shared stylesheet and script are
   separate cache-busted files (`static/app.css`, `static/app.js`, ~10 KB and ~12 KB gzipped, cached across
   every page), so the page HTML itself is only markup: a small folder listing is ~38 KB raw, ~5 KB gzipped.
4. **Fewer storage round trips.** Opening a folder used to cost a wasted `HEAD` request plus the listing.
   When the parent folder's listing is cached (it is, because that's the page you clicked from) the `HEAD`
   is skipped, and simultaneous requests for one folder share a single Hugging Face call.

### How instant folders stay correct

- **One copy of the markup.** The folder page's HTML lives in `app/templates/_listing.html` as Jinja
  macros. `/api/shell` ships the server-rendered page skeleton plus each fragment with `@@placeholders@@`;
  the browser only substitutes data (names, sizes, counts, the breadcrumb). There is no second copy of the
  markup to drift. `tests/test_fast_tree.py` asserts that a locally built page equals the server's page for
  a set of awkward folders (deep paths, `&` `'` `<` in names, emoji, rounding ties in sizes).
- **Fresh.** The tree is revalidated in the background on page load, every 15 s while you browse, when the
  tab regains focus, and straight after an upload (an unchanged tree is a tiny `304`). If the page on screen
  turns out to have been built from an older tree, it is quietly rebuilt. The server clears its own caches on
  every upload, delete and sync, so `/api/tree` is current right away.
- **Falls back, never breaks.** No saved tree yet, a folder that isn't in the tree, a modified click
  (Ctrl/Cmd/Shift/middle), a link with a query string or hash, `target`/`download` links, or any error all
  just do the normal navigation, which is today's behaviour. File pages are not built locally.
- **Bounded.** Buckets with more than `FAST_TREE_MAX_FILES` files (default 20,000) don't ship a tree and
  the feature switches itself off. It stores roughly 100-200 KB in localStorage.
- **Opt out** of it for a page with `<meta name="cdn-fast" content="off">`.

**Freshness trade-off:** pages that *are* fetched from the server are cached for 30 s in the browser, so
reopening one within 30 s can show a listing that is up to 30 s old. A hard refresh
(Ctrl/Cmd+Shift+R) always fetches fresh.

### What gets prefetched

The prefetcher covers pages that instant folders can't build (file pages, other pages), and skips
folder links the tree already handles. It is deliberately conservative:

- Same-origin links only, and never `/api/*`, `/admin`, `/mask/*`, `/pack/*`, `/static/*`, `/raw/*`,
  downloads, `target`/`download` links, or anything inside `data-turbo="false"`.
- At most **16 pages per page view**, **3 at a time**. Folder and file links on screen go first,
  navbar and footer links last. Only while the tab is visible.
- When you click, in-flight prefetches are cancelled, except the one for the page you're opening.
- Disabled on Save-Data, 2g and `prefers-reduced-data`; reduced to 6 pages / 1 at a time on 3g.

To turn it off for a page, add `<meta name="cdn-prefetch" content="off">`; to exclude a link or a
whole section, add `data-no-prefetch`. To change the limits, edit `DEFAULTS` at the top of the file
(keep `ttlMs` below the 30 s cache lifetime in `app/fast_html.py`). For debugging, run
`__cdnPrefetch.stats()` in the browser console. Prefetches carry an `X-Purpose: prefetch` request
header, and they don't show up in the Recent/Visited history, which is recorded by the page itself.

## Project layout

```
app/
  main.py          routes, uploads, zip packing, GitHub sync endpoint
  fast_html.py     browser-cache + gzip headers for rendered pages
  fast_tree.py     /api/tree and /api/shell payloads for instant folder navigation
  storage.py       Hugging Face bucket access, listing, caching, search
  upload_guard.py  upload checks: video blocking, VPN detection, client IP
  admin.py         /admin dashboard, bans, GitHub allowlist (encrypted state)
  gh_oidc.py       GitHub Actions OIDC token verification
  shortener.py     URL shortener
  stats.py         /stats
  templates/       Jinja2 pages: base.html (shared layout), index.html + _page_*.html (listing, file, batch,
                   upload, history, search, 404), _listing.html (fragments shared with fasttree.js),
                   _navbar/_breadcrumb/_icons partials, plus documentation / gh_sync_docs / stats / url_shortener
  static/          app.css + app.js (the whole UI), icons, manifest, service worker, prefetch.js, fasttree.js
tests/             JS unit/DOM/end-to-end tests (node) + offline server checks (python)
Dockerfile · render.yaml · start.sh
```

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) first. Participation is
governed by the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

[MIT](LICENSE) © 2026 Amit Dutta. All runtime dependencies are under permissive licenses (MIT, BSD,
Apache-2.0, Unlicense). The only third-party browser asset is [Turbo](https://github.com/hotwired/turbo) (MIT), loaded from
jsDelivr.

## UI notes

- **One stylesheet, one script.** All styling is in `app/static/app.css` (tokens at the top; light/dark via
  `html[data-theme]`, set before first paint) and all behaviour in `app/static/app.js`. Both are loaded on every
  page and versioned with a content hash (`?v=`), so a deploy never pairs new HTML with old CSS.
- **Delegated events only.** Turbo swaps `<body>` on each visit, so `app.js` binds everything on `document`
  (via `data-action`, `data-copy`, ids) and re-runs an idempotent `init()` on `turbo:load`.
- **File previews** (`_page_file.html`): images, video, audio and PDF are plain elements loading from the raw
  domain; text/code is fetched by `app.js` (first 256 KB) and rendered with `textContent`. HTML and SVG-as-text are
  shown as source and never executed on the main origin.
- **File-type colours** come from the file name alone (`[data-name$=".png" i]` rules at the end of `app.css`),
  so server-rendered and browser-built rows look identical without extra placeholders.
