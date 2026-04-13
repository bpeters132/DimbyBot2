#!/bin/sh
set -e
# `docker-compose.dev.yml` mounts an anonymous volume at `/app/dist` so `tsc -w` can write there.
# `dist/` is in `.dockerignore`, so the image has no pre-populated `/app/dist`; Docker then creates
# the volume as root-owned and `devuser` hits EACCES on mkdir/emit. Normalize ownership on start.
mkdir -p /app/dist
chown -R devuser:devuser /app/dist
exec su-exec devuser /usr/local/bin/dimbybot-entrypoint.sh "$@"
