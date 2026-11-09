"""Offline check of the Discord bot's link parsing.  Run from the repo root:  HF_BUCKET_ID=ci/x python tests/test_discord_bot.py"""
import os
import sys

os.environ.setdefault("HF_BUCKET_ID", "ci/placeholder")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.discord_bot import extract_paths

H = {"cdn.amit.is-a.dev"}
assert extract_paths("look https://cdn.amit.is-a.dev/a/b%20c.pdf?v=2 ok", H) == ["a/b c.pdf"]
assert extract_paths("https://cdn.amit.is-a.dev/uploads/ and https://cdn.amit.is-a.dev/uploads", H) == ["uploads"]
assert extract_paths("https://example.com/x.png", H) == []
assert extract_paths("https://cdn.amit.is-a.dev/api/get/x https://cdn.amit.is-a.dev/", H) == []
assert extract_paths("(https://cdn.amit.is-a.dev/x.txt).", H) == ["x.txt"]
assert extract_paths(" ".join(f"https://cdn.amit.is-a.dev/f{i}" for i in range(9)), H) == ["f0", "f1", "f2"]
print("ok")
