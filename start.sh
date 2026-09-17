#!/bin/bash

set -e

echo "========================================"
echo "Starting CDN + Cobalt"
echo "========================================"

echo ""
echo "========== COBALT ENV =========="
echo "API_URL=${API_URL:-https://cdn.amit.is-a.dev/cobalt/}"
echo "API_PORT=9000"
echo "COOKIE_PATH=${COOKIE_PATH:-NOT_SET}"
echo "================================"
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
API_URL="https://cdn.amit.is-a.dev/cobalt/" \
API_PORT=9000 \
node src/cobalt &

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
