"""Offline checks for the navigation fast paths (no network, no Hugging Face).

Run from the repo root:  HF_BUCKET_ID=ci/placeholder python tests/test_server_fastpaths.py

Covers: HTML caching + gzip (app/fast_html.py), skipping the wasted HEAD request when the parent
folder's listing is cached (storage.get_path_info), and one Hugging Face call per folder even when
several requests ask at once (storage.list_directory).
"""

import asyncio
import gzip
import os
import sys

os.environ.setdefault("HF_BUCKET_ID", "ci/placeholder")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402
from starlette.requests import Request  # noqa: E402
from starlette.responses import HTMLResponse  # noqa: E402

import app.main as m  # noqa: E402
from app import storage  # noqa: E402
from app.fast_html import HTML_MAX_AGE, optimise_html  # noqa: E402

# A tiny fake bucket. Directories have no `size` attribute, like the real tree items.
FILES = {
    "top.txt": 7,
    "bsc/README.md": 3000,
    "bsc/semester_1/notes.txt": 12,
    "bsc/semester_1/deep/a.bin": 5,
    "_logs/hidden.log": 1,
}
calls = {"tree": 0, "head": 0}


class Dir:
    def __init__(self, path):
        self.path = path


class File:
    def __init__(self, path, size):
        self.path, self.size = path, size


def fake_fetch_tree(path):
    calls["tree"] += 1
    path = path.strip("/")
    prefix = path + "/" if path else ""
    out = {}
    for fp, size in FILES.items():
        if not fp.startswith(prefix):
            continue
        rest = fp[len(prefix):]
        if "/" in rest:
            d = prefix + rest.split("/")[0]
            out[d] = Dir(d)
        else:
            out[fp] = File(fp, size)
    return list(out.values())


async def fake_get_file_info(path):
    calls["head"] += 1
    return {"exists": path in FILES, "size": FILES.get(path), "content_type": None}


async def no_stats():
    return None


storage._fetch_tree = fake_fetch_tree
storage.get_file_info = fake_get_file_info
m.repo_stats = no_stats


def reset():
    storage._cache.clear()
    calls["tree"] = calls["head"] = 0


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("ok  -", msg)


# --- storage ----------------------------------------------------------------------------------------

reset()
loop = asyncio.new_event_loop()

async def burst():
    return await asyncio.gather(*[storage.list_directory("bsc") for _ in range(6)])

results = loop.run_until_complete(burst())
check(calls["tree"] == 1, "six simultaneous listings of one folder make a single Hugging Face call")
check(all(r == results[0] for r in results), "...and all six get the same listing")
names = [(e["name"], e["is_dir"]) for e in results[0]]
check(names == [("semester_1", True), ("README.md", False)], "listing is folders-first, hidden paths excluded")
check(results[0][1]["size"] == 3000 and results[0][1]["size_str"] == "2.93 KB", "entries keep the raw size too")

reset()
loop.run_until_complete(storage.list_directory("bsc"))
calls["head"] = 0
info = loop.run_until_complete(storage.get_path_info("bsc/semester_1"))
check(info["exists"] is False and calls["head"] == 0, "folder is recognised from the parent listing, no HEAD")
info = loop.run_until_complete(storage.get_path_info("bsc/README.md"))
check(info["exists"] is True and info["size"] == 3000 and calls["head"] == 0, "file + size come from the parent listing, no HEAD")
info = loop.run_until_complete(storage.get_path_info("bsc/missing"))
check(info["exists"] is False and calls["head"] == 1, "a path the parent doesn't list falls back to the HEAD check")
reset()
info = loop.run_until_complete(storage.get_path_info("bsc/README.md"))
check(info["exists"] is True and calls["head"] == 1, "with no cached parent listing it falls back to the HEAD check")
loop.close()

# --- HTML optimisation -------------------------------------------------------------------------------

def req(method="GET", accept="gzip"):
    return Request({"type": "http", "method": method, "headers": [(b"accept-encoding", accept.encode())]})

big = "<html>" + "x" * 5000 + "</html>"
r = optimise_html(req(), HTMLResponse(big))
check(r.headers["content-encoding"] == "gzip" and gzip.decompress(r.body).decode() == big, "gzip round-trips")
check(int(r.headers["content-length"]) == len(r.body) < len(big), "content-length matches the compressed body")
check(r.headers["cache-control"] == f"private, max-age={HTML_MAX_AGE}", "pages are cached privately")
check("accept-encoding" in r.headers["vary"].lower(), "Vary: Accept-Encoding is set")
r = optimise_html(req(accept="identity"), HTMLResponse(big))
check("content-encoding" not in r.headers and r.body.decode() == big, "no gzip unless the client accepts it")
r = optimise_html(req(), HTMLResponse("tiny"))
check("content-encoding" not in r.headers, "tiny bodies are left uncompressed")
r = optimise_html(req(), HTMLResponse(big, status_code=404))
check("cache-control" not in r.headers and "content-encoding" not in r.headers, "non-200 responses are untouched")
r = optimise_html(req(method="POST"), HTMLResponse(big))
check("cache-control" not in r.headers, "non-GET requests are untouched")
r = HTMLResponse(big, headers={"Cache-Control": "no-store"})
check(optimise_html(req(), r).headers["cache-control"] == "no-store", "an explicit Cache-Control is respected")

# --- end to end through the real app -----------------------------------------------------------------

reset()
c = TestClient(m.app)
gz = {"Accept-Encoding": "gzip"}

r = c.get("/bsc", headers=gz)
check(r.status_code == 200 and r.headers.get("content-encoding") == "gzip", "/bsc listing is served gzipped")
check("semester_1" in r.text and "README.md" in r.text, "...and decodes to the real page")
check(r.headers["cache-control"] == f"private, max-age={HTML_MAX_AGE}", "...with the browser-cache header")

calls["head"] = 0
r = c.get("/bsc/semester_1", headers=gz)
check(r.status_code == 200 and "notes.txt" in r.text and calls["head"] == 0, "opening a folder from its parent makes no HEAD request")
r = c.get("/bsc/README.md", headers=gz)
check(r.status_code == 200 and "2.93 KB" in r.text and calls["head"] == 0, "opening a file from its parent makes no HEAD request")

r = c.get("/bsc", headers={"Accept-Encoding": "identity"})
check(r.status_code == 200 and "content-encoding" not in r.headers, "identity clients get plain HTML")

for path in ["/new", "/find", "/history", "/shorten", "/documentation", "/gh-sync"]:
    r = c.get(path, headers=gz)
    check(r.status_code == 200 and r.headers.get("content-encoding") == "gzip"
          and "max-age" in r.headers["cache-control"], f"{path} is cached and gzipped")

r = c.get("/no/such/folder", headers=gz)
check(r.status_code == 404 and "max-age" not in r.headers.get("cache-control", ""), "404 pages are not cached")
r = c.get("/static/sw.js", headers=gz)
check(r.headers["cache-control"].startswith("no-store") and "content-encoding" not in r.headers, "service worker is still no-store and untouched")

print("\nall server fast-path checks passed")
