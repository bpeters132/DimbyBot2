# Use an appropriate base image with Java (e.g., OpenJDK JRE)
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Install required system libraries and utilities
RUN apk add --no-cache \
    libgcc \
    gcompat \
    dos2unix \
    curl

# Copy the Lavalink jar and plugins
COPY Lavalink.jar Lavalink.jar
COPY plugins ./plugins

# Copy the entrypoint script
COPY entrypoint.sh entrypoint.sh
# Ensure script has correct line endings (LF) and is executable
# Ensure /tmp exists and has correct permissions
RUN dos2unix entrypoint.sh \
    && chmod +x entrypoint.sh \
    && mkdir -p /tmp \
    && chmod 1777 /tmp \
    # Add debugging steps:
    && echo "--- Listing /app contents:" \
    && ls -la /app/ \
    && echo "--- Checking for /bin/sh:" \
    && which sh

# Default port Lavalink runs on
EXPOSE 2333

# Health check to see if Lavalink is ready
# Requires LAVALINK_PORT and LAVALINK_PASSWORD env vars to be set
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD curl --fail -H "Authorization: ${LAVALINK_PASSWORD}" http://localhost:${LAVALINK_PORT:-2333}/version || exit 1

# Run the entrypoint script which generates application.yml and starts Lavalink
# Use absolute path and explicitly invoke sh to bypass shebang issues
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"] 