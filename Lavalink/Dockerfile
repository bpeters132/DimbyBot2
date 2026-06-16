# Use an appropriate base image with Java (e.g., OpenJDK JRE)
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Install required system libraries and utilities
# eudev-libs: satisfies OSHI/LinuxOperatingSystem’s libudev probe (harmless if missing for Lavalink itself).
# Unpinned: resolve to current Alpine repo revisions for this JRE image (Java major stays on 17 via the base image tag).
RUN apk add --no-cache \
    libgcc \
    gcompat \
    dos2unix \
    curl \
    eudev-libs

# Pin Lavalink version for reproducible builds; override at build time, e.g.:
#   docker build --build-arg LAVALINK_VERSION=4.2.1 -f Lavalink/Dockerfile Lavalink
ARG LAVALINK_VERSION=4.2.2
RUN curl --fail -L "https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar" -o Lavalink.jar

# Copy startup and healthcheck scripts
COPY entrypoint.sh entrypoint.sh
COPY healthcheck.sh healthcheck.sh
# Ensure script has correct line endings (LF) and is executable
# Ensure /tmp exists and has correct permissions
RUN dos2unix entrypoint.sh healthcheck.sh \
    && chmod +x entrypoint.sh \
    && chmod +x healthcheck.sh \
    && mkdir -p /tmp \
    && chmod 1777 /tmp

# Default port Lavalink runs on
EXPOSE 2333

# Health check to see if Lavalink is ready
# Requires LAVALINK_PORT and LAVALINK_PASSWORD env vars to be set
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=10 \
  CMD /bin/sh /app/healthcheck.sh || exit 1

# Run the entrypoint script which generates application.yml and starts Lavalink
# Use absolute path and explicitly invoke sh to bypass shebang issues
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"] 