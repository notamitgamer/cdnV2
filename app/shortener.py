import os
import random
import string
from pathlib import Path

SHORTENED_DIR = Path(__file__).parent / "shortened"
SHORTENED_DIR.mkdir(exist_ok=True)


def generate_id(length=8):
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def shorten_url(destination_url: str) -> str:
    """Save a destination URL under a random ID and return that ID."""
    while True:
        short_id = generate_id()
        filepath = SHORTENED_DIR / short_id
        if not filepath.exists():
            break
    filepath.write_text(destination_url, encoding="utf-8")
    return short_id


def get_destination_url(short_id: str) -> str | None:
    """Look up the destination URL for a given short ID."""
    filepath = SHORTENED_DIR / short_id
    if filepath.exists():
        return filepath.read_text(encoding="utf-8").strip()
    return None


def list_all_ids() -> list[str]:
    """Return all stored short IDs (server-side only, not for frontend)."""
    return sorted(p.name for p in SHORTENED_DIR.iterdir() if p.is_file())
