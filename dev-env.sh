#!/bin/bash

# Simple script to manage the development environment

set -euo pipefail

# Ensure we are in the script's directory (project root)
cd "$(dirname "$0")" || exit 1

# Function to display usage
usage() {
  echo "Usage: $0 {up|down|down-volumes|build|rebuild|logs|restart [service]|exec <service> [command]}"
  echo "  up: Build (if needed) and start all services in detached mode."
  echo "  down: Stop and remove containers (keeps named volumes — Postgres data persists)."
  echo "  down-volumes: Like down, but also removes volumes (full wipe incl. database)."
  echo "  build: Force build/rebuild images for services."
  echo "  rebuild: Stop, force build/rebuild, and start all services."
  echo "  logs: Follow logs for all services (or specific service)."
  echo "  restart [service]: Restart a specific service (e.g., 'bot')."
  echo "  exec <service> [command]: Execute a command in a running service (default: sh)."
  exit 1
}

# Check if any command was provided
if [ "$#" -eq 0 ]; then
  usage
fi

# Command aliases for docker-compose using dev overrides (array: safe with spaces in paths)
DC=(docker compose -f docker-compose.yml -f docker-compose.dev.yml)

# Parse command
COMMAND=$1
shift # Remove the first argument (the command)

case $COMMAND in
  up)
    echo "Starting development environment..."
    "${DC[@]}" up --build -d "$@" # Build if needed, run detached
    ;;
  down)
    echo "Stopping development environment (volumes kept)..."
    "${DC[@]}" down "$@"
    ;;
  down-volumes)
    echo "Stopping development environment and removing volumes..."
    "${DC[@]}" down -v "$@"
    ;;
  build)
    echo "Building development images..."
    "${DC[@]}" build "$@"
    ;;
  rebuild)
    echo "Rebuilding development environment (down, build, up)..."
    echo "Stopping..."
    "${DC[@]}" down # Keep volumes so Postgres guild settings and auth data persist
    echo "Building..."
    "${DC[@]}" build "$@" # Build images, pass any extra args
    echo "Starting..."
    "${DC[@]}" up -d "$@" # Match build service selection when args are passed
    ;;
  logs)
    echo "Following logs..."
    "${DC[@]}" logs -f "$@"
    ;;
  restart)
    SERVICE="${1:-}"
    if [ -z "$SERVICE" ]; then
      echo "Error: Please specify a service to restart (e.g., 'bot')."
      exit 1
    fi
    echo "Restarting service '$SERVICE'..."
    "${DC[@]}" restart "$SERVICE"
    ;;
  exec)
    if [ $# -lt 1 ] || [ -z "${1:-}" ]; then
      echo "Error: Please specify a service to execute command in (e.g., 'bot')."
      exit 1
    fi
    SERVICE=$1
    shift # Remove service name argument
    if [ $# -eq 0 ]; then
      CMD=(sh)
    else
      CMD=("$@")
    fi
    echo "Executing '${CMD[*]}' in service '$SERVICE'..."
    "${DC[@]}" exec "$SERVICE" "${CMD[@]}"
    ;;
  *)
    usage
    ;;
esac

echo "Done."
