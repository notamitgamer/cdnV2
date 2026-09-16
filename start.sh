#!/bin/sh

set -e

echo "========================================"
echo "Starting CDN + Cobalt"
echo "========================================"

echo ""
echo "========== PROXY ENV =========="
echo "HTTP_PROXY=${HTTP_PROXY:+SET}"
echo "HTTPS_PROXY=${HTTPS_PROXY:+SET}"
echo "ALL_PROXY=${ALL_PROXY:+SET}"
echo "NO_PROXY=${NO_PROXY:+SET}"
echo "http_proxy=${http_proxy:+SET}"
echo "https_proxy=${https_proxy:+SET}"
echo "all_proxy=${all_proxy:+SET}"
echo "no_proxy=${no_proxy:+SET}"
echo "==============================="
echo ""

echo "========== COBALT ENV =========="
echo "API_URL=${API_URL:-NOT_SET}"
echo "API_PORT=${API_PORT:-9000}"
echo "COOKIE_PATH=${COOKIE_PATH:-NOT_SET}"
echo "YOUTUBE_SESSION_SERVER=${YOUTUBE_SESSION_SERVER:-NOT_SET}"
echo "YOUTUBE_SESSION_INNERTUBE_CLIENT=${YOUTUBE_SESSION_INNERTUBE_CLIENT:-NOT_SET}"
echo "YOUTUBE_PLAYER_ID=${YOUTUBE_PLAYER_ID:-NOT_SET}"
echo "ENABLE_DEPRECATED_YOUTUBE_HLS=${ENABLE_DEPRECATED_YOUTUBE_HLS:-NOT_SET}"
echo "================================"
echo ""

echo "Starting Cobalt..."

cd /opt/cobalt-api

API_URL="http://127.0.0.1:9000/" \
API_PORT=9000 \
pnpm start &

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
        echo "ERROR: Cobalt process stopped unexpectedly."
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
echo "Cobalt:  http://127.0.0.1:9000"
echo "FastAPI: http://0.0.0.0:${PORT:-8000}"
echo "========================================"

wait -n "$COBALT_PID" "$FASTAPI_PID"

echo ""
echo "ERROR: One of the services stopped."
echo "Cobalt PID: $COBALT_PID"
echo "FastAPI PID: $FASTAPI_PID"

exit 1
