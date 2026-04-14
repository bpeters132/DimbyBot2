# Pin Node + Alpine minor; apk packages are unpinned so repo updates within 3.22 do not break builds.
FROM node:22-alpine3.22 AS builder

WORKDIR /app

COPY docker/ytdlp-requirements.txt /tmp/ytdlp-requirements.txt
# Native build tools (e.g. sodium) + ffmpeg for any runtime checks during build.
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    build-base \
    autoconf \
    automake \
    libtool \
    g++ \
    && python3 -m venv /opt/venv \
    && . /opt/venv/bin/activate \
    && pip3 install --no-cache-dir -r /tmp/ytdlp-requirements.txt \
    && ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn db:generate && yarn build:bot \
    && yarn install --production --frozen-lockfile \
    && test -f node_modules/.prisma/client/default.js

# --- runtime image ---
FROM node:22-alpine3.22

WORKDIR /app

# Runtime: ffmpeg + Python for the copied venv; yt-dlp venv is built in the builder stage.
RUN apk add --no-cache \
    python3 \
    ffmpeg \
    su-exec \
    wget

COPY --from=builder /opt/venv /opt/venv
RUN ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp

COPY package.json yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Runtime environment (inject via compose/K8s; do not bake secrets into the image):
#   Required for Lavalink: LAVALINK_HOST, LAVALINK_PORT, LAVALINK_PASSWORD, LAVALINK_NODE_ID, LAVALINK_SECURE
#   Bot: BOT_TOKEN, CLIENT_ID, and other vars from .env.example
#   Autoplay (Spotify Web API — same app as Lavalink Spotify plugin):
#     LAVALINK_SPOTIFY_CLIENT_ID, LAVALINK_SPOTIFY_CLIENT_SECRET
#   Optional autoplay overrides: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
#   MusicBrainz fallback: MUSICBRAINZ_CONTACT or MUSICBRAINZ_CONTACT_URL; MUSICBRAINZ_SIMILAR=off to disable

COPY entrypoint.sh entrypoint.sh
COPY healthcheck.sh healthcheck.sh
# dos2unix only for CRLF normalization; remove before layer commit so it is not a runtime dependency.
RUN apk add --no-cache dos2unix \
    && dos2unix entrypoint.sh healthcheck.sh \
    && chmod +x entrypoint.sh healthcheck.sh \
    && apk del dos2unix \
    && chown -R node:node /app

# Default non-root; entrypoint still supports `docker run --user 0` for one-time volume chown + su-exec.
USER node

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]

# healthcheck.sh probes GET /health on BOT_API_PORT (Express bot API).
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD /bin/sh /app/healthcheck.sh
