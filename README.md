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
| `GET /api/pack/{path}` | Zip a folder (`/api/pack-info/{path}` returns its size first). |
| `POST /api/shorten` | Create a short link. |
| `POST /api/gh-sync` | Sync a GitHub repo (GitHub Actions OIDC token + tar.gz archive). |
| `GET /api/stats` | Storage statistics. |

Uploads go to either `uploads/` or `third-party/`.

Default limits per client IP: 200 MB/hour for file uploads, 50 MB/hour for URL uploads, and 10 requests
per minute / 50 per hour for the shortener. GitHub sync has no rate limit but accepts at most a 200 MB
compressed archive. Video files are refused.

## Project layout

```
app/
  main.py          routes, uploads, zip packing, GitHub sync endpoint
  storage.py       Hugging Face bucket access, listing, caching, search
  upload_guard.py  upload checks: video blocking, VPN detection, client IP
  admin.py         /admin dashboard, bans, GitHub allowlist (encrypted state)
  gh_oidc.py       GitHub Actions OIDC token verification
  shortener.py     URL shortener
  stats.py         /stats
  templates/       Jinja2 pages (index.html renders most page types)
  static/          icons, manifest, service worker
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
