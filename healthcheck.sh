#!/bin/sh
# Docker HEALTHCHECK for the bot image: verify Express bot API GET /health on BOT_API_PORT.
set -e

BOT_PORT="${BOT_API_PORT:-3001}"
if ! wget --timeout=5 --tries=1 -qO- "http://127.0.0.1:${BOT_PORT}/health" >/dev/null 2>&1; then
    echo "healthcheck: bot /health not reachable on BOT_API_PORT=${BOT_PORT}" >&2
    exit 1
fi
exit 0
