"""A tiny in-memory stand-in for the Hugging Face bucket, shared by the offline tests.

`install(storage, main)` patches the storage layer so the real FastAPI app can be exercised with no
network. Directories have no `size` attribute, like the real tree items.
"""

import datetime

# path -> size in bytes. Includes awkward cases on purpose: HTML-special characters, spaces, a deep
# path (long breadcrumb), root-level files, an excluded .gitattributes and hidden internal prefixes.
FILES = {
    "README.md": 1200,
    ".gitattributes": 66,
    "top-level.txt": 7,
    "bsc/README.md": 3000,
    "bsc/semester_1/notes.txt": 12,
    "bsc/semester_1/deep/a.bin": 5,
    "bsc/semester_1/deep/er/est/x.txt": 1048576,
    "bsc/semester_1/Zeta.pdf": 2500000,
    "bsc/semester_1/alpha.pdf": 999,
    "a&b/it's here/<x> \"q\".txt": 42,
    "a&b/plain.txt": 1023,
    "uploads/9f3a1c2b-photo one.png": 2048,
    "bsc/ünï 😀/a.txt": 9,
    "bsc/semester_1/deep/er/est/more/x.txt": 3,
    "solo/only.txt": 1152,
    "solo2/a.txt": 1,
    "_logs/hidden.log": 1,
    "_batches/b1.json": 1,
}


class Dir:
    def __init__(self, path):
        self.path = path


class File:
    def __init__(self, path, size):
        self.path, self.size = path, size
        self.uploaded_at = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)


def _children(path):
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


def fetch_tree(path):
    return _children(path)


def fetch_tree_recursive(path=""):
    path = path.strip("/")
    prefix = path + "/" if path else ""
    return [File(fp, s) for fp, s in FILES.items() if fp.startswith(prefix)]


async def get_file_info(path):
    return {"exists": path in FILES, "size": FILES.get(path), "content_type": None}


def install(storage, main):
    storage._fetch_tree = fetch_tree
    storage._fetch_tree_recursive = fetch_tree_recursive
    storage.get_file_info = get_file_info
    storage._cache.clear()
