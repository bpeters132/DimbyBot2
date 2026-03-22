#!/bin/sh
# Docker HEALTHCHECK: cheap liveness — after entrypoint `exec`, PID 1 should be Node (yarn start -> node).
set -e
cmd=$(tr '\0' ' ' < /proc/1/cmdline 2>/dev/null || true)
case "$cmd" in
  *node*) exit 0 ;;
  *)
    echo "healthcheck: unexpected PID 1 cmdline: $cmd" >&2
    exit 1
    ;;
esac
