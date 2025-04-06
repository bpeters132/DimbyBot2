# Use an appropriate base image with Java (e.g., OpenJDK JRE)
FROM eclipse-temurin:17-jre-alpine

WORKDIR /opt/Lavalink

# Copy the Lavalink jar and plugins
COPY Lavalink.jar Lavalink.jar
COPY plugins ./plugins

# Copy the entrypoint script
COPY entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh

# Default port Lavalink runs on
EXPOSE 2333

# Run the entrypoint script which generates application.yml and starts Lavalink
ENTRYPOINT ["./entrypoint.sh"] 