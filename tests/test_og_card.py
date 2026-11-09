"""Offline check of the preview card and the Discord embed JSON.  Run from the repo root:  HF_BUCKET_ID=ci/x python tests/test_og_card.py"""
import json
import os
import re
import sys

os.environ.setdefault("HF_BUCKET_ID", "ci/placeholder")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.main import templates
from app.og_card import render_card

png = render_card("math-01.pdf", "PDF", "33.88 KB", "a/math-01.pdf")
assert png[:8] == b"\x89PNG\r\n\x1a\n"
assert render_card("x" * 300 + ".tar.gz", "TAR.GZ", "1 MB", "p/" * 80)  # long names must not crash

ctx = dict(cdn_base_url="https://cdn.example.com", raw_base_url="https://raw.example.com", repo_file_count=1, repo_size_str="1 MB")
for extra in (dict(page="file", path="a/b.pdf", filename="b.pdf", file_ext="pdf", file_size_str="1 KB"),
              dict(page="file", path="a/p.png", filename="p.png", file_ext="png", file_size_str="1 KB"),
              dict(page="listing", path="a/dir", items=[1, 2])):
    html = templates.env.get_template("index.html").render(**ctx, **extra)
    raw = re.search(r'<script id="discord:component-embed" type="application/json">(.*?)</script>', html, re.S).group(1)
    assert len(raw.encode()) <= 3000, len(raw)
    top = json.loads(raw)["component"]
    assert top["type"] == 17 and top["components"][-1]["type"] == 1
    assert all(b["style"] == 5 for b in top["components"][-1]["components"])
print("ok")
