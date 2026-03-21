# Use a recent Node.js LTS version
FROM node:22-alpine AS builder

WORKDIR /app

# Install yt-dlp and native build tools (e.g. sodium)
RUN apk add --no-cache python3 py3-pip ffmpeg build-base autoconf automake libtool g++ \
    && python3 -m venv /opt/venv \
    && . /opt/venv/bin/activate \
    && pip3 install --no-cache-dir yt-dlp \
    && ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp

COPY package.json yarn.lock ./
RUN yarn install

COPY . .
RUN yarn build

# --- runtime image ---
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-pip ffmpeg build-base autoconf automake libtool g++ \
    && python3 -m venv /opt/venv \
    && . /opt/venv/bin/activate \
    && pip3 install --no-cache-dir yt-dlp \
    && ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp

COPY package.json yarn.lock ./
RUN yarn install --production

COPY --from=builder /app/dist ./dist

# Runtime environment (inject via compose/K8s; do not bake secrets into the image):
#   Required for Lavalink: LAVALINK_HOST, LAVALINK_PORT, LAVALINK_PASSWORD, LAVALINK_NODE_ID, LAVALINK_SECURE
#   Bot: BOT_TOKEN, CLIENT_ID, and other vars from .env.example
#   Autoplay (Spotify Web API — same app as Lavalink Spotify plugin):
#     LAVALINK_SPOTIFY_CLIENT_ID, LAVALINK_SPOTIFY_CLIENT_SECRET
#   Optional autoplay overrides: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
#   MusicBrainz fallback: MUSICBRAINZ_CONTACT or MUSICBRAINZ_CONTACT_URL; MUSICBRAINZ_SIMILAR=off to disable

COPY entrypoint.sh entrypoint.sh
RUN apk add --no-cache dos2unix \
    && dos2unix entrypoint.sh \
    && chmod +x entrypoint.sh

ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
