import os
import io
import random
import string
import asyncio
import re
import httpx
from huggingface_hub import HfApi

HF_REPO_ID = os.getenv("HF_REPO_ID", "notamitgamer/cdn")
HF_TOKEN = os.getenv("HF_TOKEN")
api = HfApi(token=HF_TOKEN) if HF_TOKEN else None

# Reusable HTTP client for fast connection pooling & HTTP keep-alive
_client = httpx.AsyncClient(follow_redirects=True, timeout=10.0)

# Alphanumeric validator to guard against path traversal attempts
_ID_REGEX = re.compile(r"^[a-z0-9]{4,16}$")

def generate_id(length: int = 8) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choices(chars, k=length))

async def shorten_url(destination_url: str) -> str:
    """Save a destination URL under an in-memory byte payload to Hugging Face."""
    if not api:
        raise RuntimeError("HF_TOKEN is not configured.")

    destination_url = destination_url.strip()

    # Collision-check loop with a safeguard cutoff
    attempts = 0
    while True:
        short_id = generate_id()
        hf_url = f"https://huggingface.co/datasets/{HF_REPO_ID}/resolve/main/_shortened/{short_id}"
        r = await _client.head(hf_url)
        if r.status_code == 404:
            break
        attempts += 1
        if attempts > 5:
            # Fallback to longer ID if collisions occur
            short_id = generate_id(length=12)
            break

    # Upload directly from memory without writing to disk
    payload = io.BytesIO(destination_url.encode("utf-8"))

    def _upload():
        api.upload_file(
            path_or_fileobj=payload,
            path_in_repo=f"_shortened/{short_id}",
            repo_id=HF_REPO_ID,
            repo_type="dataset",
            token=HF_TOKEN,
            commit_message=f"shorten: {short_id}",
        )

    await asyncio.to_thread(_upload)
    return short_id

async def get_destination_url(short_id: str) -> str | None:
    """Look up the destination URL directly from Hugging Face resolve endpoints."""
    short_id = short_id.strip().lower()
    if not _ID_REGEX.match(short_id):
        return None

    hf_url = f"https://huggingface.co/datasets/{HF_REPO_ID}/resolve/main/_shortened/{short_id}"
    try:
        r = await _client.get(hf_url)
        if r.status_code == 200:
            return r.text.strip()
    except httpx.RequestError:
        return None
    return None

def list_all_ids() -> list[str]:
    """Stub kept for router compatibility."""
    return []