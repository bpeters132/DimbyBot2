#!/bin/sh
set -e
# `docker-compose.dev.yml` mounts an anonymous volume at `/app/dist` so `tsc -w` can write there.
# `dist/` is in `.dockerignore`, so the image has no pre-populated `/app/dist`; Docker then creates
# the volume as root-owned and `devuser` hits EACCES on mkdir/emit. Normalize ownership on start.
mkdir -p /app/dist
chown -R devuser:devuser /app/dist
# Prisma client writes (e.g. `yarn db:generate` in dev) — small trees only, not all of node_modules.
if [ -d /app/node_modules/.prisma ]; then
    chown -R devuser:devuser /app/node_modules/.prisma
fi
if [ -d /app/node_modules/@prisma ]; then
    chown -R devuser:devuser /app/node_modules/@prisma
fi
exec su-exec devuser /usr/local/bin/dimbybot-entrypoint.sh "$@"
