#!/bin/sh
set -e
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
# Compose sometimes passes an empty DATABASE_URL when .env interpolation differs from the bot service.
# If unset, build the same in-stack URL the bot uses (postgres-db:5432 on the internal network).
if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_DB:-}" ]; then
    export DATABASE_URL="$(
        node -e "const u=process.env.POSTGRES_USER||'';const p=encodeURIComponent(process.env.POSTGRES_PASSWORD||'');const d=process.env.POSTGRES_DB||'';const h=process.env.POSTGRES_INTERNAL_HOST||'postgres-db';console.log('postgresql://'+u+':'+p+'@'+h+':5432/'+d)"
    )"
fi
if [ -f /app/server.js ]; then
    exec node /app/server.js
fi
if [ -f /app/src/web/server.js ]; then
    exec node /app/src/web/server.js
fi
echo "dimbybot-web: Next.js standalone server.js not found under /app" >&2
exit 1
