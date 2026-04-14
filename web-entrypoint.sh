#!/bin/sh
set -e
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
if [ -f /app/server.js ]; then
    exec node /app/server.js
fi
if [ -f /app/src/web/server.js ]; then
    exec node /app/src/web/server.js
fi
echo "dimbybot-web: Next.js standalone server.js not found under /app" >&2
exit 1
