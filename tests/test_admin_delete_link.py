"""Offline checks for the admin "Delete by link" endpoints (no network, no Hugging Face).

Run from the repo root:  python tests/test_admin_delete_link.py
"""

import asyncio
import os
import sys

os.environ.setdefault("HF_BUCKET_ID", "ci/placeholder")
os.environ["ADMIN_TOKEN"] = "test-token"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.main as m  # noqa: E402
from app import admin, storage  # noqa: E402


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("ok  -", msg)


BUCKET = {
    "uploads/a.png": 10, "uploads/b.png": 20,
    "jaasx009/College/x/1.cpp": 100, "jaasx009/College/x/2.cpp": 200, "jaasx009/College/y.txt": 5,
    "top.txt": 1, "_logs/hidden.log": 1,
}
deleted_calls = []


def fake_files_under(path):
    path = path.strip("/")
    return [(p, s) for p, s in BUCKET.items() if p == path or p.startswith(path + "/")]


async def fake_loaded():
    return True


async def fake_save():
    return {"ok": True}


storage.files_under = fake_files_under
storage.delete_object = lambda path: deleted_calls.append(path)
admin.ensure_loaded = fake_loaded
admin._mutate_and_save = fake_save
admin._state["log"] = [{"path": "jaasx009/College/x/1.cpp", "status": "ok"}, {"path": "uploads/a.png", "status": "ok"}]

# --- link -> path -------------------------------------------------------------------------------
r = admin._resolve_link
check(r("https://cdn.amit.is-a.dev/jaasx009/College/x/1.cpp") == "jaasx009/College/x/1.cpp", "CDN page link")
check(r("https://raw.cdn.amit.is-a.dev/uploads/a%20b.png?x=1#h") == "uploads/a b.png", "raw link, decoded, query/hash dropped")
check(r("https://cdn.amit.is-a.dev/api/get/uploads/a.png") == "uploads/a.png", "/api/get link")
check(r("/api/pack/jaasx009/College/") == "jaasx009/College", "/api/pack folder link, trailing slash")
check(r("jaasx009/College/x") == "jaasx009/College/x", "plain path")
for bad in ("", "   ", "uploads", "https://cdn.amit.is-a.dev/", "https://cdn.amit.is-a.dev/a/../b", "_logs/hidden.log", "a//b"):
    try:
        r(bad)
        raise AssertionError(f"should refuse {bad!r}")
    except HTTPException as e:
        check(e.status_code == 400, f"refuses {bad!r}")

# --- endpoints ----------------------------------------------------------------------------------
c = TestClient(m.app)
H = {"Authorization": "Bearer test-token"}
check(c.post("/api/admin/delete-link/preview", json={"link": "uploads/a.png"}).status_code == 401, "preview needs the admin token")
check(c.post("/api/admin/delete-link", json={"link": "uploads/a.png", "confirm_path": "uploads/a.png"}).status_code == 401, "delete needs the admin token")

p = c.post("/api/admin/delete-link/preview", headers=H, json={"link": "https://cdn.amit.is-a.dev/jaasx009/College"}).json()
check(p["kind"] == "folder" and p["count"] == 3 and p["size"] == 305 and p["path"] == "jaasx009/College", "folder preview: 3 files, 305 B")
p = c.post("/api/admin/delete-link/preview", headers=H, json={"link": "uploads/a.png"}).json()
check(p["kind"] == "file" and p["count"] == 1, "file preview")
check(c.post("/api/admin/delete-link/preview", headers=H, json={"link": "nope/missing"}).status_code == 404, "unknown path -> 404, nothing to delete")
check(c.post("/api/admin/delete-link/preview", headers=H, json={"link": "uploads"}).status_code == 400, "top-level folder is refused")

check(deleted_calls == [], "previews delete nothing")
res = c.post("/api/admin/delete-link", headers=H, json={"link": "uploads/a.png", "confirm_path": "uploads/OTHER.png"})
check(res.status_code == 400 and deleted_calls == [], "mismatched confirm_path deletes nothing")
res = c.post("/api/admin/delete-link", headers=H, json={"link": "jaasx009/College", "confirm_path": "jaasx009/College"})
check(res.status_code == 200 and res.json()["deleted"] == 3 and deleted_calls == ["jaasx009/College"], "folder delete removes the whole folder in one call")
check(admin._state["log"][0]["status"] == "deleted" and admin._state["log"][1]["status"] == "ok", "upload log rows under the folder are marked deleted, others untouched")
check(c.post("/api/admin/delete-link", headers=H, json={"link": "nope/missing", "confirm_path": "nope/missing"}).status_code == 404, "delete of a missing path is a 404")

page = c.get("/admin").text
check('id="dl"' in page and "dlCheck()" in page and "/api/admin/delete-link/preview" in page, "admin page has the Delete by link section")
_public = open("app/static/listing.js").read() + open("app/static/pane.js").read() + open("app/templates/base.html").read() + open("app/templates/_sidebar.html").read()
check("admin/delete" not in _public and "delete-link" not in _public, "nothing delete-related in the public UI (listing, sidebar, base template)")
print("\nall admin delete-by-link checks passed")
