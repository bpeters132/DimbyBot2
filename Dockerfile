# Use a recent Node.js LTS version
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package.json yarn.lock ./
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
    && echo "--- Listing /usr/src/app contents:" \
    && ls -la /usr/src/app/ \
    && echo "--- Checking for /bin/sh:" \
    && which sh

# Run the entrypoint script which generates lavaNodesConfig.js and starts the bot
# Use absolute path for clarity
ENTRYPOINT ["/usr/src/app/entrypoint.sh"] 