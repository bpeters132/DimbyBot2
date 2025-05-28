# Use a recent Node.js LTS version
FROM node:20-alpine

WORKDIR /app

# Install yt-dlp and its dependencies (always latest from pip)
# Also install build tools needed for native Node.js modules
# Use pipx to install yt-dlp to avoid PEP 668 issues
RUN apk add --no-cache python3 py3-pip ffmpeg build-base autoconf automake libtool g++ pipx \
    && pipx install yt-dlp \
    && pipx ensurepath \
    # Optionally, create a symlink if yt-dlp installed by pipx isn't automatically in the default PATH 
    # for subsequent RUN commands or the ENTRYPOINT. The pipx ensurepath might handle this for the user
    # running the command, but for system-wide access or other users, a symlink is safer.
    # Check common pipx bin locations:
    && (if [ -f /root/.local/bin/yt-dlp ]; then ln -s /root/.local/bin/yt-dlp /usr/local/bin/yt-dlp; fi || \
        if [ -f /usr/local/bin/yt-dlp ]; then echo "yt-dlp already in /usr/local/bin"; else echo "yt-dlp not found in common pipx paths"; exit 1; fi)

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