#!/bin/bash

set -e

echo "========================================"
echo "Starting CDN + Cobalt"
echo "========================================"

echo ""
echo "========== COBALT ENV =========="
echo "API_URL=${API_URL:-https://cdn.amit.is-a.dev/cobalt/}"
echo "API_PORT=9000"
echo "================================"
echo ""

COBALT_COOKIE_PATH=""

if [ -n "$YOUTUBE_COOKIE_HEADER" ]; then
    echo "YOUTUBE_COOKIE_HEADER is set - writing cookies.json..."

    COBALT_COOKIE_PATH="/tmp/cobalt-cookies.json"

    YOUTUBE_COOKIE_HEADER="$YOUTUBE_COOKIE_HEADER" python3 -c "
import json
import os

cookie_header = os.environ['YOUTUBE_COOKIE_HEADER'].strip()

with open('$COBALT_COOKIE_PATH', 'w') as f:
    json.dump({'youtube': [cookie_header]}, f)
"

    echo "Wrote $COBALT_COOKIE_PATH"
else
    echo "YOUTUBE_COOKIE_HEADER not set - continuing without YouTube cookies"
    echo "(YouTube downloads will likely fail with error.api.youtube.login)"
fi

echo ""
echo "Starting Cobalt..."

cd /opt/cobalt-api

# NOTE: we intentionally do NOT gate startup on the presence of a specific
# file (e.g. "src/cobalt"). Cobalt's own image runs it as
# `node src/cobalt`, which Node resolves via its module resolution
# algorithm (src/cobalt.js or src/cobalt/index.js) - there is no literal
# file named "cobalt" with no extension. A hard existence check on that
# exact path previously killed the whole container on every boot even
# when the Cobalt build itself was fine. Instead we start the process and
# let the readiness probe below be the real success/failure signal.
if [ -n "$COBALT_COOKIE_PATH" ]; then
    API_URL="https://cdn.amit.is-a.dev/cobalt/" \
    API_PORT=9000 \
    COOKIE_PATH="$COBALT_COOKIE_PATH" \
    node src/cobalt &
else
    API_URL="https://cdn.amit.is-a.dev/cobalt/" \
    API_PORT=9000 \
    node src/cobalt &
fi

COBALT_PID=$!

echo "Cobalt PID: $COBALT_PID"

echo ""
echo "Waiting for Cobalt to start..."

COBALT_READY=0

for i in $(seq 1 30); do
    if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:9000/', timeout=1)" >/dev/null 2>&1; then
        COBALT_READY=1
        echo "Cobalt is ready."
        break
    fi

    if ! kill -0 "$COBALT_PID" 2>/dev/null; then
        echo "ERROR: Cobalt process exited unexpectedly during startup."
        wait "$COBALT_PID"
        exit 1
    fi

    sleep 1
done

if [ "$COBALT_READY" -ne 1 ]; then
    echo "ERROR: Cobalt did not become ready within 30 seconds."
    kill "$COBALT_PID" 2>/dev/null || true
    exit 1
fi

echo ""
echo "Starting FastAPI..."

cd /app

uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" &

FASTAPI_PID=$!

echo "FastAPI PID: $FASTAPI_PID"

echo ""
echo "========================================"
echo "Both services started"
echo "========================================"
echo "Cobalt:  http://127.0.0.1:9000"
echo "FastAPI: http://0.0.0.0:${PORT:-8000}"
echo "========================================"

wait -n "$COBALT_PID" "$FASTAPI_PID"

echo ""
echo "ERROR: One of the services stopped."
echo "Cobalt PID: $COBALT_PID"
echo "FastAPI PID: $FASTAPI_PID"

exit 1
