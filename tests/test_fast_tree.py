"""Offline checks for instant folder navigation (app/fast_tree.py + app/static/fasttree.js).

Run from the repo root:  HF_BUCKET_ID=ci/x python tests/test_fast_tree.py     (needs `node`)

The important one: a folder page assembled in the browser from /api/tree + /api/shell must be the same
HTML the server renders for that folder. If someone edits the listing markup in a way the client
can't reproduce, this fails with a diff pointing at the first difference.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse

os.environ.setdefault("HF_BUCKET_ID", "ci/placeholder")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tests"))

from fastapi.testclient import TestClient  # noqa: E402

import app.main as m  # noqa: E402
from app import fast_tree, storage  # noqa: E402
import fake_bucket  # noqa: E402

fake_bucket.install(storage, m)
client = TestClient(m.app)


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("ok  -", msg)


def node(*args):
    out = subprocess.run(["node", *args], capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0:
        raise AssertionError(f"node failed: {out.stderr}")
    return out.stdout


def norm(html):
    return re.sub(r"\s+", " ", html).strip()


# --- /api/tree ---------------------------------------------------------------------------------------

gz = {"Accept-Encoding": "gzip"}
r = client.get("/api/tree", headers=gz)
tree = r.json()
paths = {p for p, _ in tree["files"]}
check(r.status_code == 200 and r.headers.get("content-encoding") == "gzip", "/api/tree is served gzipped")
check(tree["n"] == len(tree["files"]) == len(paths), "...with one entry per file")
check("README.md" in paths and ".gitattributes" in paths and "bsc/semester_1/notes.txt" in paths, "...containing the files")
check(not any(p.startswith(("_logs", "_batches")) for p in paths), "...and none of the hidden internal prefixes")
check(r.headers["etag"] == f'"{tree["v"]}"' and r.headers["cache-control"] == "no-cache", "...with an ETag that is revalidated each time")

r2 = client.get("/api/tree", headers={"If-None-Match": r.headers["etag"]})
check(r2.status_code == 304 and not r2.content, "an unchanged tree costs an empty 304")
check(client.get("/api/tree", headers={"If-None-Match": "W/" + r.headers["etag"]}).status_code == 304, "...even when a proxy weakened the ETag")
check(client.get("/api/tree", headers={"If-None-Match": '"stale"'}).status_code == 200, "a different ETag gets the full tree")

fake_bucket.FILES["brand/new.txt"] = 5
storage._cache.clear()
check(client.get("/api/tree").json()["v"] != tree["v"], "a new file changes the tree's version")
del fake_bucket.FILES["brand/new.txt"]
storage._cache.clear()

fast_tree.MAX_FILES, saved_max = 3, fast_tree.MAX_FILES
fast_tree._tree_memo = None
big = client.get("/api/tree").json()
check(big.get("too_large") is True and "files" not in big, "a tree over FAST_TREE_MAX_FILES is not shipped")
fast_tree.MAX_FILES = saved_max
fast_tree._tree_memo = None

saved_files = dict(fake_bucket.FILES)
fake_bucket.FILES.clear()
storage._cache.clear()
check(client.get("/api/tree").status_code == 503, "an empty/failed listing is a 503, never an empty tree")
fake_bucket.FILES.update(saved_files)
storage._cache.clear()

# --- /api/shell --------------------------------------------------------------------------------------

r = client.get("/api/shell", headers=gz)
shell = r.json()
check(r.status_code == 200 and r.headers.get("content-encoding") == "gzip", "/api/shell is served gzipped")
check(all(shell["html"].count(s) == 1 for s in fast_tree.SLOTS), "every slot appears exactly once in the shell")
check("skeleton" not in shell["html"] and "{{" not in shell["html"], "the shell is fully rendered HTML")
check(shell["cdn_base"] == m.CDN_BASE_URL, "...and carries the CDN base URL for the visited-history entry")
check(client.get("/api/shell", headers={"If-None-Match": r.headers["etag"]}).status_code == 304, "the shell revalidates with a 304 too")
check(client.get("/static/fasttree.js").status_code == 200, "/static/fasttree.js is served")

# --- the page built in the browser == the page the server renders ------------------------------------

tmp = tempfile.mkdtemp()
tree = client.get("/api/tree").json()
json.dump(tree, open(f"{tmp}/tree.json", "w"))
json.dump(shell, open(f"{tmp}/shell.json", "w"))

folders = [
    "",                                   # root: header, no breadcrumb, no "go up"
    "bsc", "bsc/semester_1",
    "bsc/semester_1/deep/er/est",         # 6 crumbs: collapsed breadcrumb
    "bsc/semester_1/deep/er/est/more",
    "a&b", "a&b/it's here",               # HTML-special characters in folder names
    "uploads",                            # a file name with a space
    "bsc/ünï 😀",                          # non-ASCII + astral characters (escaping in the history script)
    "solo",                               # 1152 B: exact tie, Python rounds half to even ("1.12 KB")
    "solo2",                              # singular counts: "1 file"
]
built = json.loads(node("tests/compose.js", f"{tmp}/tree.json", f"{tmp}/shell.json", *folders))
for folder in folders:
    url = "/" + urllib.parse.quote(folder, safe="/")
    server = client.get(url, headers={"Accept-Encoding": "identity"})
    assert server.status_code == 200, (url, server.status_code)
    a, b = norm(server.text), norm(built[folder] or "")
    if a != b:
        i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
        raise AssertionError(
            f"locally built page differs from the server's for {folder!r} at char {i}\n"
            f"  server: ...{a[max(0, i - 120):i + 160]}\n  client: ...{b[max(0, i - 120):i + 160]}"
        )
    print(f"ok  - folder {folder or '(root)'!r}: built page == server page")

missing = json.loads(node("tests/compose.js", f"{tmp}/tree.json", f"{tmp}/shell.json", "no/such/folder"))
check(missing["no/such/folder"] is None, "a folder that isn't in the tree is not built locally (the server decides)")

# --- text helpers match Python/Jinja byte for byte ---------------------------------------------------

sizes = [0, 1, 1023, 1024, 1025, 1152, 1536, 2047, 3000, 999999, 1048575, 1048576, 2500000, 10**9,
         5 * 2**30 + 12345, 2**40, 3 * 2**40 + 7, 2**50, 1000 * 2**40]
js = json.loads(node("-e", "const {formatSize}=require('./app/static/fasttree.js');"
                           "console.log(JSON.stringify(JSON.parse(process.argv[1]).map(formatSize)))", json.dumps(sizes)))
py = [storage.format_size(s) for s in sizes]
check(js == py, f"format_size agrees with Python for {len(sizes)} sizes, including exact rounding ties")

tricky = ["plain", "a&b", "it's", "<script>alert(1)</script>", "ünï 😀", "tab\there", 'q"uote', "back\\slash",
          "\x7f", "\u2028", "line\nbreak", "$&", "@@name@@", "</script>"]
render_tojson = m.templates.env.from_string("{{ x|tojson }}").render   # the real filter, as the templates use it
js = json.loads(node("-e", "const {jsonForScript}=require('./app/static/fasttree.js');"
                           "console.log(JSON.stringify(JSON.parse(process.argv[1]).map(jsonForScript)))", json.dumps(tricky)))
check(js == [render_tojson(x=t) for t in tricky], "jsonForScript agrees with Jinja's |tojson")

from markupsafe import escape  # noqa: E402
js = json.loads(node("-e", "const {escapeHtml}=require('./app/static/fasttree.js');"
                           "console.log(JSON.stringify(JSON.parse(process.argv[1]).map(escapeHtml)))", json.dumps(tricky)))
check(js == [str(escape(t)) for t in tricky], "escapeHtml agrees with markupsafe.escape")

# --- real Turbo + real pages, in jsdom ---------------------------------------------------------------

e2e_dir = tempfile.mkdtemp()
json.dump(tree, open(f"{e2e_dir}/tree.json", "w"))
json.dump(shell, open(f"{e2e_dir}/shell.json", "w"))
for name, url in {"from": "/bsc", "to": "/bsc/semester_1", "root": "/"}.items():
    open(f"{e2e_dir}/{name}.html", "w", encoding="utf-8").write(client.get(url, headers={"Accept-Encoding": "identity"}).text)

have_deps = all(os.path.isdir(os.path.join(ROOT, "node_modules", d)) for d in ("jsdom", "@hotwired/turbo"))
if have_deps:
    out = subprocess.run(["node", "tests/turbo_e2e.js", e2e_dir], capture_output=True, text=True, cwd=ROOT)
    print(out.stdout.rstrip())
    check(out.returncode == 0, "end-to-end: real Turbo renders the locally built page, history and Back work, no page request")
elif os.getenv("REQUIRE_E2E"):
    raise AssertionError("jsdom / @hotwired/turbo are not installed but REQUIRE_E2E is set")
else:
    print("skip - end-to-end test (npm install --no-save --no-package-lock jsdom @hotwired/turbo@8.0.4 to enable)")

print("\nall fast-tree checks passed")
