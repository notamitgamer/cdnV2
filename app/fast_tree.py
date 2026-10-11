"""Data for instant folder navigation (static/fasttree.js).

The browser keeps two things between visits:

* the **tree**: every non-hidden file as ``[path, size]`` (``/api/tree``), small enough that the whole
  bucket's structure fits in a few kilobytes gzipped, and
* the **shell**: a server-rendered folder page with *slots* where the folder-specific parts go, plus
  the HTML of each of those parts with ``@@placeholders@@`` (``/api/shell``).

With both in hand a folder page can be assembled locally, with no request, and handed to Turbo. The
markup comes from the same Jinja macros (templates/_listing.html) the server uses for ordinary
renders, so the client never carries a second copy of it; only the data is filled in. See
tests/test_fast_tree.py, which checks that a locally assembled page equals the server's.
"""

import gzip
import hashlib
import json
import os

from markupsafe import Markup
from starlette.requests import Request
from starlette.responses import Response

# Above this many files the tree is not shipped and the browser falls back to normal navigation.
MAX_FILES = int(os.getenv("FAST_TREE_MAX_FILES", "20000"))

# Markers left in the shell where the folder-specific HTML goes. Each must appear exactly once.
SLOTS = (
    "<!--@root-header-->",
    "<!--@breadcrumb-->",
    "<!--@toolbar-->",
    "<!--@list-->",
    "<!--@stats-->",
    "/*@visit*/",
)

_tree_memo: tuple | None = None   # (items list, payload, etag): the items list is cached by storage, so identity is a cheap "unchanged" test
_shell_memo: dict = {}


def _digest(*chunks: str) -> str:
    h = hashlib.sha1()
    for c in chunks:
        h.update(c.encode("utf-8"))
    return h.hexdigest()[:16]


def tree_payload(items: list) -> tuple[dict, str]:
    """(payload, etag) for /api/tree, built from storage's full tree listing."""
    global _tree_memo
    if _tree_memo is not None and _tree_memo[0] is items:
        return _tree_memo[1], _tree_memo[2]

    files = sorted([it["path"], int(it["size"] or 0)] for it in items if not it["is_dir"])
    etag = _digest(json.dumps(files, separators=(",", ":"), ensure_ascii=False))
    if len(files) > MAX_FILES:
        payload = {"v": etag, "n": len(files), "too_large": True}
    else:
        payload = {"v": etag, "n": len(files), "files": files}
    _tree_memo = (items, payload, etag)
    return payload, etag


def shell_payload(env, ctx: dict) -> tuple[dict, str]:
    """(payload, etag) for /api/shell: the skeleton page and the fill-in fragments."""
    key = (ctx.get("cdn_base_url"), ctx.get("raw_base_url"))
    if key in _shell_memo:
        return _shell_memo[key]

    html = env.get_template("index.html").render(
        {**ctx, "page": "listing", "path": "", "items": [], "skeleton": True}
    )
    for slot in SLOTS:
        if html.count(slot) != 1:
            raise RuntimeError(f"shell slot {slot!r} should appear exactly once, found {html.count(slot)}")

    m = env.get_template("_listing.html").module
    parts = {
        "root_header": m.root_header(),
        "count": m.count("@@n@@", "@@word@@", "@@s@@"),
        "toolbar": m.toolbar("@@counts@@", "@@path@@"),
        "go_up": m.go_up("@@parent_path@@"),
        "row_dir": m.row_dir("@@name@@", "@@path@@"),
        "row_file": m.row_file("@@name@@", "@@path@@", "@@size_str@@"),
        "empty": m.empty_state(),
        "stats": m.footer_stats("@@n@@", "@@s@@", "@@size_str@@"),
        "crumb_container": m.crumb_container("@@inner@@", ctx["cdn_base_url"], "@@tail@@"),
        "crumb_link": m.crumb_link("@@href@@", "@@name@@"),
        "crumb_collapsed": m.crumb_collapsed("@@menu@@"),
        "copy_btn": m.copy_btn("@@path@@"),
        "visit": m.visit_script(Markup(
            'type: "folder",\n path: @@path_json@@,\n cdn_url: @@cdn_url_json@@,'
        )),
    }
    parts = {k: str(v) for k, v in parts.items()}
    payload = {"html": html, "parts": parts, "cdn_base": ctx["cdn_base_url"]}
    etag = _digest(html, json.dumps(parts, sort_keys=True), ctx["cdn_base_url"])
    payload["v"] = etag
    _shell_memo[key] = (payload, etag)
    return payload, etag


def _etag_matches(header: str, etag: str) -> bool:
    # Proxies may turn a strong ETag into a weak one (W/"...") when they compress; accept either.
    for token in header.split(","):
        token = token.strip()
        if token.startswith("W/"):
            token = token[2:]
        if token == f'"{etag}"':
            return True
    return False


def json_response(request: Request, payload: dict, etag: str) -> Response:
    """JSON with an ETag (so an unchanged tree costs a tiny 304) and gzip."""
    headers = {"ETag": f'"{etag}"', "Cache-Control": "no-cache", "Vary": "Accept-Encoding"}
    if _etag_matches(request.headers.get("if-none-match", ""), etag):
        return Response(status_code=304, headers=headers)
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if "gzip" in request.headers.get("accept-encoding", "").lower():
        body = gzip.compress(body, 6)
        headers["Content-Encoding"] = "gzip"
    return Response(body, media_type="application/json", headers=headers)
