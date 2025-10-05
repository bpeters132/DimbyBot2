# Multi-stage Dockerfile for DimbyBot

# bot-base: Install system dependencies, Python venv, yt-dlp, ffmpeg without app code
FROM node:20-alpine AS bot-base

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
    && pip3 install --no-cache-dir yt-dlp \
    && ln -sf /opt/venv/bin/yt-dlp /usr/bin/yt-dlp

# deps: Copy package files and install dependencies with frozen lockfile
FROM bot-base AS deps

WORKDIR /app

COPY package.json yarn.lock ./

RUN YARN_CACHE_FOLDER=/tmp/.yarn-cache yarn install --frozen-lockfile

# builder: Copy project files, reuse deps, prepare production assets
FROM deps AS builder

COPY . .

# Prune node_modules for production (remove dev dependencies)
RUN yarn install --production --frozen-lockfile && yarn cache clean

# runtime: Minimal runtime image with copied artifacts
FROM node:20-alpine AS runtime

# Copy yt-dlp environment from bot-base
COPY --from=bot-base /opt/venv /opt/venv
COPY --from=bot-base /usr/bin/yt-dlp /usr/bin/yt-dlp

# Copy production node_modules and app source from builder
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app /app

# Copy and prepare entrypoint script
COPY entrypoint.sh /app/entrypoint.sh

RUN apk add --no-cache dos2unix \
    && dos2unix /app/entrypoint.sh \
    && chmod +x /app/entrypoint.sh

WORKDIR /app

# Run the entrypoint script
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]