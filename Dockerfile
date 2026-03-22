# Pin Alpine minor so apk version pins stay valid (see builder RUN apk add).
FROM node:22-alpine3.22 AS builder

WORKDIR /app

COPY docker/ytdlp-requirements.txt /tmp/ytdlp-requirements.txt
# Native build tools (e.g. sodium) — pinned for reproducibility (Alpine 3.22 / current node:22-alpine).
RUN apk add --no-cache \
    python3=3.12.12-r0 \
    py3-pip=25.1.1-r1 \
    ffmpeg=8.0.1-r1 \
    build-base=0.5-r3 \
    autoconf=2.72-r1 \
    automake=1.18.1-r0 \
    libtool=2.5.4-r2 \
    g++=15.2.0-r2 \
    && python3 -m venv /opt/venv \
    && . /opt/venv/bin/activate \
    && pip3 install --no-cache-dir -r /tmp/ytdlp-requirements.txt \
    && ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build \
    && rm -rf node_modules \
    && yarn install --production --frozen-lockfile

# --- runtime image ---
FROM node:22-alpine3.22

WORKDIR /app

COPY docker/ytdlp-requirements.txt /tmp/ytdlp-requirements.txt
# Runtime: ffmpeg + yt-dlp only (no compiler toolchain).
RUN apk add --no-cache \
    python3=3.12.12-r0 \
    py3-pip=25.1.1-r1 \
    ffmpeg=8.0.1-r1 \
    && python3 -m venv /opt/venv \
    && . /opt/venv/bin/activate \
    && pip3 install --no-cache-dir -r /tmp/ytdlp-requirements.txt \
    && ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp

COPY package.json yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Runtime environment (inject via compose/K8s; do not bake secrets into the image):
#   Required for Lavalink: LAVALINK_HOST, LAVALINK_PORT, LAVALINK_PASSWORD, LAVALINK_NODE_ID, LAVALINK_SECURE
#   Bot: BOT_TOKEN, CLIENT_ID, and other vars from .env.example
#   Autoplay (Spotify Web API — same app as Lavalink Spotify plugin):
#     LAVALINK_SPOTIFY_CLIENT_ID, LAVALINK_SPOTIFY_CLIENT_SECRET
#   Optional autoplay overrides: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
#   MusicBrainz fallback: MUSICBRAINZ_CONTACT or MUSICBRAINZ_CONTACT_URL; MUSICBRAINZ_SIMILAR=off to disable

COPY entrypoint.sh entrypoint.sh
RUN apk add --no-cache dos2unix=7.5.3-r0 \
    && dos2unix entrypoint.sh \
    && chmod +x entrypoint.sh

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
