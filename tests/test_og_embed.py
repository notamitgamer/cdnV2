"""Offline checks for the link-preview (Discord / Slack / Telegram) tags on file pages.

Run from the repo root:  python tests/test_og_embed.py
"""

import os
import re
import sys

os.environ.setdefault("HF_BUCKET_ID", "ci/placeholder")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app.main as m  # noqa: E402


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("ok  -", msg)


def page(path, size="2.66 KB", size_bytes=2724, modified="2026-01-01 00:00"):
    filename = path.split("/")[-1]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    ctx = {
        "page": "file", "path": path, "filename": filename, "file_ext": ext,
        "file_size": size_bytes, "file_size_str": size, "file_modified": modified,
        "cdn_base_url": m.CDN_BASE_URL, "raw_base_url": m.RAW_BASE_URL, "skeleton": False,
        "og": m.og_for_file(path, filename, ext, size, modified),
    }
    return m.templates.env.get_template("index.html").render(ctx)


def meta(html, key):
    found = re.findall(r'<meta (?:property|name)="%s" content="([^"]*)"' % re.escape(key), html)
    return found


img = page("assets/my photo.png")
check(meta(img, "og:image") == [f"{m.RAW_BASE_URL}/assets/my%20photo.png"], "image: og:image is the raw file (spaces encoded)")
check(meta(img, "twitter:card") == ["summary_large_image"], "image: large preview card")
check(meta(img, "og:description") == ["PNG · 2.66 KB · 2026-01-01 00:00 UTC"], "image: description = type, size, modified")
check(meta(img, "og:title") == ["my photo.png · amit/cdn"], "image: title is the file name")
check(meta(img, "og:url") == [f"{m.CDN_BASE_URL}/assets/my%20photo.png"], "image: canonical link is the CDN page")
check(len(meta(img, "og:image")) == 1 and len(meta(img, "og:type")) == 1, "no duplicate image/type tags")

vid = page("uploads/clip.mp4", size="12.00 MB")
check(meta(vid, "og:video") == [f"{m.RAW_BASE_URL}/uploads/clip.mp4"] and meta(vid, "og:video:type") == ["video/mp4"], "video: player tags with the right type")
check(meta(vid, "og:type") == ["video.other"] and meta(vid, "twitter:card") == ["player"], "video: video.other / player card")

aud = page("uploads/song.mp3", size="3.00 MB")
check(meta(aud, "og:audio") == [f"{m.RAW_BASE_URL}/uploads/song.mp3"] and meta(aud, "og:audio:type") == ["audio/mpeg"], "audio: audio tags")

zipf = page("third-party/pack.zip", size="1.50 MB")
check(meta(zipf, "og:image") == [f"{m.CDN_BASE_URL}/static/icons/og-logo.png"], "other files: the site logo as the card image")
check(meta(zipf, "twitter:card") == ["summary"] and meta(zipf, "og:description") == ["ZIP · 1.50 MB · 2026-01-01 00:00 UTC"], "other files: small card with type, size, date")

svg = page("assets/logo.svg")
check(meta(svg, "og:image") == [f"{m.CDN_BASE_URL}/static/icons/og-logo.png"], "svg is not offered as a preview image (chat apps do not render it)")

unk = page("docs/README", size="-", modified="-")
check(meta(unk, "og:description") == ["File"], "unknown size/date: just the type")

evil = page('x/"><script>alert(1)</script>.txt')
check("<script>alert(1)</script>" not in evil.split("</head>")[0], "file names are escaped inside the meta tags")

listing = m.templates.env.get_template("index.html").render({
    "page": "listing", "path": "", "items": [], "cdn_base_url": m.CDN_BASE_URL, "raw_base_url": m.RAW_BASE_URL, "skeleton": True})
check(meta(listing, "twitter:card") == ["summary"] and "og:video" not in listing, "folder pages keep the plain site card")

print("\nall link-preview checks passed")
