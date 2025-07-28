---
description: 
globs: 
alwaysApply: true
---
# DimbyBot2 Project Guide

This document outlines the architecture, rules, and guidelines for contributing to DimbyBot2.

## Project Architecture

This project is a Discord music bot built with **Node.js** and the **discord.js** library. Its music functionality is powered by a **Lavalink** server, which acts as a separate audio-playing service to offload heavy processing from the bot itself.

### Key Components & Libraries

-   **Discord.js (`discord.js`)**: The primary framework for all interactions with the Discord API.
-   **Lavalink Server**: A standalone audio-playing server, written in Java, that handles the actual streaming and playback of music. This project is configured to run Lavalink in a Docker container for easy setup and consistency.
-   **Lavalink Client (`lavalink-client`)**: The Node.js client library that connects the bot to the Lavalink server, enabling communication and control over audio playback.
-   **Lavalink Source Plugins**: The Lavalink instance is enhanced with source plugins to support a wider range of music platforms:
    -   **LavaSrc**: Enables playback from Spotify, Apple Music, and Deezer.
    -   **youtube-source**: A dedicated source plugin for YouTube playback.

### Data Flow for Music Playback

1.  A user issues a music command (e.g., `/play`) in Discord.
2.  The **discord.js** bot receives the interaction.
3.  The bot uses the **`lavalink-client`** to send a request to the **Lavalink Server**.
4.  Lavalink, using its source plugins, fetches the track from the specified source (e.g., YouTube, Spotify).
5.  Lavalink streams the audio to the Discord voice channel.

## Directory Structure

-   `src/`: Main source code for the bot.
    -   `commands/`: All slash command definitions, organized into categories (`admin`, `music`, etc.).
    -   `events/`: Event handlers for Discord gateway events (e.g., `onReady`, `onInteractionCreate`).
    -   `lib/`: Core classes like `BotClient.js` (the main client) and `LavalinkManager.js`.
    -   `util/`: Reusable utility functions.
-   `Lavalink/`: Contains the Dockerfile and entrypoint script for the custom Lavalink image.
-   `docker-compose.yml`: Defines the services, networks, and volumes for running the bot and the Lavalink server together.
-   `.env.example`: An example environment file. You must copy this to `.env` for local development.

## Contribution Rules & Setup

### Prerequisites

-   **Docker** and **Docker Compose**: Required to run the Lavalink server and the bot in a containerized environment.
-   **Node.js** (for local development outside Docker)

### Local Development Setup

1.  **Clone the repository.**
2.  **Create your environment file:**
    ```sh
    cp .env.example .env
    ```
    Fill in the required values in the `.env` file, especially `BOT_TOKEN`. The Lavalink credentials should match the defaults in `docker-compose.yml` unless you change them.
3.  **Start the services:**
    This command will build the images if they don't exist and start the bot and Lavalink server in detached mode.
    ```sh
    docker-compose up -d --build
    ```
4.  **To view logs:**
    ```sh
    docker-compose logs -f
    ```

## Code Style Guide (ESLint & Prettier)

This project uses ESLint and Prettier to enforce a consistent code style. The configurations can be found in:
*   ESLint: [`.eslintrc.json`](mdc:.eslintrc.json)
*   Prettier: [`.prettierrc.json`](mdc:.prettierrc.json)

**Key Formatting Rules:**

*   **Semicolons:** **Not used**.
*   **Quotes:** Use **double quotes**.
*   **Indentation:** Use **2 spaces**.
*   **Line Length:** Aim for a maximum of **100 characters**.

Please ensure all contributions adhere to these style guidelines. Run `yarn format:fix` before committing your changes.

### Package Manager

This project uses **Yarn** as its package manager. Please use `yarn` for all dependency management and script execution (e.g., `yarn add <package>`, `yarn dev`).

**Do not use `npm`**. Using `npm` can lead to inconsistencies in the `node_modules` directory and conflicts with the `yarn.lock` file.

## References

*   [Lavalink Client Documentation](https://tomato6966.github.io/lavalink-client/home/installation/)
*   [Lavalink YouTube Source Plugin](https://github.com/lavalink-devs/youtube-source)
*   [LavaSrc Plugin](https://github.com/topi314/LavaSrc)