#!/bin/sh
# Docker HEALTHCHECK:
# - If WEB_ENABLED=true, verify web endpoint is reachable.
# - Otherwise, fallback to cheap liveness by checking PID 1 cmdline includes node.
set -e

if [ "${WEB_ENABLED:-false}" = "true" ]; then
  PORT="${WEB_PORT:-3001}"
  if wget --timeout=5 --tries=1 -qO- "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    exit 0
  fi
  echo "healthcheck: /health not reachable on port ${PORT}" >&2
  exit 1
fi

cmd=$(tr '\0' ' ' < /proc/1/cmdline 2>/dev/null || true)
case "$cmd" in
  *node*) exit 0 ;;
  *)
    echo "healthcheck: unexpected PID 1 cmdline: $cmd" >&2
    exit 1
    ;;
esac
