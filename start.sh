#!/bin/sh

set -e

echo "Starting Cobalt..."

cd /opt/cobalt/api

API_URL="${COBALT_API_URL:-https://cdn.amit.is-a.dev/cobalt/}"
API_PORT="${COBALT_PORT:-9000}"

export API_URL
export API_PORT
export API_LISTEN_ADDRESS="127.0.0.1"

pnpm start &
COBALT_PID=$!

echo "Cobalt started with PID ${COBALT_PID}"

cd /app

echo "Starting FastAPI..."

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"