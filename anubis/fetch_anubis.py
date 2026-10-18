"""Download a pinned Anubis release, verify its SHA-256 and extract the binary.

Used by the Dockerfile build stage. Reads ANUBIS_VERSION and ANUBIS_SHA256 from
the environment and writes the binary to /out/anubis.
"""
import hashlib
import os
import tarfile
import urllib.request

version = os.environ["ANUBIS_VERSION"]
expected = os.environ["ANUBIS_SHA256"]
url = (
    "https://github.com/TecharoHQ/anubis/releases/download/"
    f"v{version}/anubis-{version}-linux-amd64.tar.gz"
)

data = urllib.request.urlopen(url, timeout=120).read()
actual = hashlib.sha256(data).hexdigest()
if actual != expected:
    raise SystemExit(f"Anubis checksum mismatch: expected {expected}, got {actual}")

with open("/tmp/anubis.tgz", "wb") as f:
    f.write(data)

member_name = f"anubis-{version}-linux-amd64/bin/anubis"
with tarfile.open("/tmp/anubis.tgz") as tar:
    member = tar.getmember(member_name)
    member.name = "anubis"
    tar.extract(member, "/out")
os.chmod("/out/anubis", 0o755)
print(f"Installed Anubis {version}")
