# Docker Compose commands with dev overrides
DC := docker compose -f docker-compose.yml -f docker-compose.dev.yml

# Default target
.PHONY: help
help:
	@echo "Available commands:"
	@echo "  make up         - Build (if needed) and start all services in detached mode"
	@echo "  make down       - Stop and remove containers, networks, and volumes"
	@echo "  make build     - Force build/rebuild images for services"
	@echo "  make rebuild   - Stop, force build/rebuild, and start all services"
	@echo "                   Use 'service=<name>' to rebuild specific service"
	@echo "  make logs      - Follow logs for all services"
	@echo "  make restart   - Restart a specific service (e.g., 'make restart service=bot')"
	@echo "  make exec      - Execute a command in a running service (e.g., 'make exec service=bot cmd=sh')"

.PHONY: up
up:
	@echo "Starting development environment..."
	$(DC) up --build -d $(filter-out $@,$(MAKECMDGOALS))

.PHONY: down
down:
	@echo "Stopping development environment..."
	$(DC) down -v $(filter-out $@,$(MAKECMDGOALS))

.PHONY: build
build:
	@echo "Building development images..."
	@if [ -n "$(service)" ]; then \
		echo "Building service '$(service)'..."; \
		$(DC) build $(service); \
	else \
		$(DC) build $(filter-out $@,$(MAKECMDGOALS)); \
	fi

.PHONY: rebuild
rebuild:
	@if [ -n "$(service)" ]; then \
		echo "Rebuilding service '$(service)'..."; \
		$(DC) stop $(service); \
		$(DC) rm -f $(service); \
		$(DC) build $(service); \
		$(DC) up -d $(service); \
	else \
		echo "Rebuilding all services..."; \
		echo "Stopping..."; \
		$(DC) down -v; \
		echo "Building..."; \
		$(DC) build $(filter-out $@,$(MAKECMDGOALS)); \
		echo "Starting..."; \
		$(DC) up -d; \
	fi

.PHONY: logs
logs:
	@echo "Following logs..."
	$(DC) logs -f $(filter-out $@,$(MAKECMDGOALS))

.PHONY: restart
restart:
	@if [ -z "$(service)" ]; then \
		echo "Error: Please specify a service to restart (e.g., 'make restart service=bot')"; \
		exit 1; \
	fi
	@echo "Restarting service '$(service)'..."
	$(DC) restart $(service)

.PHONY: exec
exec:
	@if [ -z "$(service)" ]; then \
		echo "Error: Please specify a service to execute command in (e.g., 'make exec service=bot cmd=sh')"; \
		exit 1; \
	fi
	@echo "Executing '$(or $(cmd),sh)' in service '$(service)'..."
	$(DC) exec $(service) $(or $(cmd),sh)

# Catch-all target to allow for passing additional arguments
%:
	@: 