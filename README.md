# DimbyBot2

A Discord bot for friends! Rewritten in Node.js.

## About

This project is a rewrite of the original DimbyBot using Node.js and the discord.js library.
Author is just a dude that can barely code but can figure things out.

## Features

*(Add a brief description of the bot's key features here)*

## Prerequisites

*   Node.js (Check `package.json` for specific version requirements if any)
*   npm or yarn

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd DimbyBot2
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```

## Configuration (Deployment via GitLab CI/CD)

For optimal deployment to a destination server, this project uses GitLab CI/CD.

1.  **Fork this repository** on GitLab.
2.  In your forked repository's GitLab settings, navigate to **Settings > CI/CD > Variables**.
3.  Define the following environment variables required by the bot:
    ```dotenv
    DISCORD_TOKEN=your_discord_bot_token
    # Add other necessary environment variables
    # LAVALINK_HOST=...
    # LAVALINK_PORT=...
    # LAVALINK_PASSWORD=...
    # EMAIL_USER=...
    # EMAIL_PASS=...
    # GUILD_ID=... (Required for deployGuild/destroyGuild scripts)
    ```
    **Note:** The `.env` file itself is **not** used during CI/CD deployment. The variables listed above (or in a potential `.env.example` file) serve as a reference and **must** be defined 1:1 within your GitLab repository's **Settings > CI/CD > Variables**.
    The CI/CD pipeline configured in `.gitlab-ci.yml` (or similar) will use these GitLab variables when deploying the bot.

## Local Development Setup

If you want to run the bot locally for development or testing:

1.  **Prerequisites:** Ensure you have Docker installed and running on your machine.
2.  **Environment Variables:** Create a `.env` file in the root directory. This file **is required** for local development. Add the necessary variables (referencing the list in the Configuration section or a potential `.env.example`) and fill in the values for your local setup.
3.  **Lavalink Configuration:** Create a `lavaNodesConfig.js` file in the root directory. This file defines the connection details for your local Lavalink server. *(You may need to refer to existing examples or documentation for the required structure of this file).*
4.  **Build & Run Docker Environment:** Execute the development environment script:
    ```bash
    ./dev-env.sh
    ```
    This script should build the necessary Docker images (including the bot and potentially Lavalink) and start the containers.

## Usage

*   **Run locally (using Docker setup):**
    ```bash
    ./dev-env.sh
    ```
*   **Start the bot (within deployment environment):** The `npm start` command is typically used by the deployment process (e.g., inside the Docker container managed by CI/CD or the `dev-env.sh` script).
    ```bash
    npm start
    ```
*   **Deploy Slash Commands (run locally or via CI/CD):**
    *   Globally: `npm run deployGlobal`
    *   To a specific guild: `npm run deployGuild` (requires `GUILD_ID` environment variable)
*   **Remove Slash Commands (run locally or via CI/CD):**
    *   Globally: `npm run destroyGlobal`
    *   From a specific guild: `npm run destroyGuild` (requires `GUILD_ID` environment variable)

## Project Structure

```
src/
├── commands/      # Slash command definitions
├── deploy/        # Scripts for deploying/destroying commands
├── events/        # Event handlers (e.g., messageCreate, interactionCreate)
├── lib/           # Core libraries or bot-specific modules
├── util/          # Utility functions
└── index.js       # Main application entry point
```

## Key Dependencies

*   [discord.js](https://discord.js.org/): The primary library for interacting with the Discord API.
*   [lavalink-client](https://github.com/freyacodes/lavalink-client): Client for interacting with a Lavalink server.
*   [dotenv](https://github.com/motdotla/dotenv): Loads environment variables from a `.env` file.
*   [nodemailer](https://nodemailer.com/): For sending emails.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details (if one exists) or refer to `package.json`.
