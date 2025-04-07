#!/bin/bash

# Simple script to manage the development environment

# Ensure we are in the script's directory (project root)
cd "$(dirname "$0")"

# Function to display usage
usage() {
  echo "Usage: $0 {up|down|build|logs|restart [service]|exec <service> [command]}"
  echo "  up: Build (if needed) and start all services in detached mode."
  echo "  down: Stop and remove containers, networks, and volumes."
  echo "  build: Force build/rebuild images for services."
  echo "  logs: Follow logs for all services (or specific service)."
  echo "  restart [service]: Restart a specific service (e.g., 'bot')."
  echo "  exec <service> [command]: Execute a command in a running service (default: sh)."
  exit 1
}

# Command aliases for docker-compose using dev overrides
DC="docker-compose -f docker-compose.yml -f docker-compose.dev.yml"

# Parse command
COMMAND=$1
shift # Remove the first argument (the command)

case $COMMAND in
  up)
    echo "Starting development environment..."
    $DC up --build -d "$@" # Build if needed, run detached
    ;;
  down)
    echo "Stopping development environment..."
    $DC down -v "$@" # Stop and remove volumes
    ;;
  build)
    echo "Building development images..."
    $DC build "$@"
    ;;
  logs)
    echo "Following logs..."
    $DC logs -f "$@"
    ;;
  restart)
    SERVICE=$1
    if [ -z "$SERVICE" ]; then
      echo "Error: Please specify a service to restart (e.g., 'bot')."
      exit 1
    fi
    echo "Restarting service '$SERVICE'..."
    $DC restart "$SERVICE"
    ;;
  exec)
    SERVICE=$1
    shift # Remove service name argument
    CMD=${@:-sh} # Default to 'sh' if no command provided
    if [ -z "$SERVICE" ]; then
      echo "Error: Please specify a service to execute command in (e.g., 'bot')."
      exit 1
    fi
    echo "Executing '$CMD' in service '$SERVICE'..."
    $DC exec "$SERVICE" $CMD
    ;;
  *)
    usage
    ;;
esac

echo "Done."
exit 0 