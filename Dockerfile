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
RUN chmod +x entrypoint.sh

# Run the entrypoint script which generates lavaNodesConfig.js and starts the bot
ENTRYPOINT ["./entrypoint.sh"] 