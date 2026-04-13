#!/bin/sh
set -eu

if [ -z "${LAVALINK_PASSWORD:-}" ]; then
    echo "Lavalink healthcheck: missing LAVALINK_PASSWORD" >&2
    exit 1
fi

curl --fail --silent \
    -H "Authorization: ${LAVALINK_PASSWORD}" \
    "http://127.0.0.1:${LAVALINK_PORT:-2333}/version" >/dev/null
