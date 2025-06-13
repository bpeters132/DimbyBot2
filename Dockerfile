# Use a recent Node.js LTS version
FROM node:20-alpine

WORKDIR /app

# Install yt-dlp and its dependencies (always latest from pip)
# Also install build tools needed for native Node.js modules
RUN apk add --no-cache python3 py3-pip ffmpeg build-base autoconf automake libtool g++ \
    && pip3 install --no-cache-dir yt-dlp \
    && ln -sf /usr/local/bin/yt-dlp /usr/bin/yt-dlp

# Copy package files and install dependencies
COPY package.json yarn.lock ./
# It's generally better to run `yarn install` *after* installing build deps
# and *before* copying the rest of the app code to leverage Docker layer caching.
RUN yarn install --production

# Copy the rest of the application code
COPY . .

# Copy the entrypoint script
COPY entrypoint.sh entrypoint.sh
# Ensure script has correct line endings (LF) and is executable
RUN apk add --no-cache dos2unix \
    && dos2unix entrypoint.sh \
    && chmod +x entrypoint.sh \
    # Add debugging steps:
    && echo "--- Listing /app contents:" \
    && ls -la /app/ \
    && echo "--- Checking for /bin/sh:" \
    && which sh

# Run the entrypoint script which generates lavaNodesConfig.js and starts the bot
# Use absolute path and explicitly invoke sh to bypass shebang issues
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"] 