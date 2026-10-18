#!/bin/bash

set -e

echo "========================================"
echo "Starting CDN"
echo "========================================"

# Default: serve the app directly, exactly as before.
if [ "${ANUBIS_ENABLED:-0}" != "1" ]; then
    exec uvicorn app.main:app \
        --host 0.0.0.0 \
        --port "${PORT:-8000}"
fi

# Anubis mode: Anubis listens on the public $PORT and forwards to the app,
# which moves to a loopback-only port.
APP_PORT="${ANUBIS_APP_PORT:-8001}"

if [ -z "${ED25519_PRIVATE_KEY_HEX:-}" ]; then
    # Without a fixed key, solved challenges stop being valid on every restart.
    echo "WARNING: ED25519_PRIVATE_KEY_HEX is not set; using a random key for this run." >&2
    ED25519_PRIVATE_KEY_HEX="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    export ED25519_PRIVATE_KEY_HEX
fi

export BIND=":${PORT:-8000}"
export TARGET="http://127.0.0.1:${APP_PORT}"
export POLICY_FNAME="${ANUBIS_POLICY_FNAME:-/app/anubis/botPolicies.yaml}"
export DIFFICULTY="${ANUBIS_DIFFICULTY:-4}"
export METRICS_BIND="${ANUBIS_METRICS_BIND:-127.0.0.1:9090}"
export SERVE_ROBOTS_TXT="${ANUBIS_SERVE_ROBOTS_TXT:-0}"
# Render/Cloudflare send X-Forwarded-For, not X-Real-Ip; Anubis needs one of them.
export CUSTOM_REAL_IP_HEADER="${ANUBIS_REAL_IP_HEADER:-X-Forwarded-For}"

echo "Anubis enabled: :${PORT:-8000} -> ${TARGET}"

uvicorn app.main:app --host 127.0.0.1 --port "$APP_PORT" &
APP_PID=$!
anubis &
ANUBIS_PID=$!

shutdown() {
    kill "$APP_PID" "$ANUBIS_PID" 2>/dev/null || true
}
trap shutdown TERM INT

# If either process dies, stop the other and exit so the platform restarts us.
set +e
wait -n "$APP_PID" "$ANUBIS_PID"
STATUS=$?
shutdown
wait 2>/dev/null || true
exit "$STATUS"
