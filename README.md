# DimbyBot2

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/bpeters132/DimbyBot2?utm_source=oss&utm_medium=github&utm_campaign=bpeters132%2FDimbyBot2&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

A Discord bot for friends! Rewritten in Node.js.

## About

This project is a rewrite of the original DimbyBot using Node.js and the discord.js library.
Author is just a dude that can barely code but can figure things out.

## Features

- Music
- Single simple clear command
- More to come

## Prerequisites

- Node.js - current LTS
- [Yarn](https://yarnpkg.com/) (this repo uses Yarn 1.x; see `packageManager` in `package.json`)
- **Docker Compose v2.24.4 or newer** if you use `./dev-env.sh` / `docker-compose.dev.yml` (the dev override uses `ports: !override`, which requires that Compose version)

## Installation

1.  Clone the repository:

    ```bash
    git clone <repository-url>
    cd DimbyBot2
    ```

2.  Install dependencies:

    ```bash
    yarn install
    ```

## Configuration (deployment)

**Local:** Copy `.env.example` to `.env` and fill in values. For Lavalink, use `lavaNodesConfig.js.example` as a template for `lavaNodesConfig.js` (or rely on `entrypoint.sh` in Docker to generate it from env vars).

**GitHub Actions:** Production deploy is defined in `.github/workflows/deploy.yml`. It builds container images, pushes to GHCR, and SSHes to your server to run `docker compose`. Configure the required values as **repository secrets** in GitHub (**Settings → Secrets and variables → Actions**). See the workflow’s “Generate .env file” step for the secret names used on the server. Optional **`FEEDBACK_EMAIL`** is the inbox for the disabled `/suggest` feature (see `.env.example`).

## Local Development Setup

If you want to run the bot locally for development or testing:

1.  **Prerequisites:** Ensure you have Docker installed and running on your machine.
2.  **Environment Variables:** Create a `.env` file in the root directory. This file **is required** for local development. Add the necessary variables (referencing the list in the Configuration section or a potential `.env.example`) and fill in the values for your local setup.
3.  **Lavalink Configuration:** Create a `lavaNodesConfig.js` file in the root directory. This file defines the connection details for your local Lavalink server. _(You may need to refer to existing examples or documentation for the required structure of this file)._
4.  **Build & Run Docker Environment:** Execute the development environment script:

    ```bash
    ./dev-env.sh build
    ```

    This script should build the necessary Docker images (including the bot and Lavalink) and start the containers.

## Usage

- **Run locally (using Docker setup):**

    ```bash
    ./dev-env.sh up
    ```

- **Deploy Slash Commands (run locally; run `yarn build` first so `dist/deploy/` exists):**
    - Globally: `yarn deployGlobal`
    - To a specific guild: `yarn deployGuild` (requires `GUILD_ID` environment variable)
- **Remove Slash Commands:**
    - Globally: `yarn destroyGlobal`
    - From a specific guild: `yarn destroyGuild` (requires `GUILD_ID` environment variable)

## Project Structure

```text
src/
├── commands/      # Slash command definitions
├── deploy/        # Scripts for deploying/destroying commands
├── events/        # Event handlers (e.g., messageCreate, interactionCreate)
├── lib/           # Core libraries or bot-specific modules
├── util/          # Utility functions
├── types/         # Shared TypeScript types
└── index.ts       # Main application entry (compiled to dist/)
```

## Key Dependencies

- [discord.js](https://discord.js.org/): The primary library for interacting with the Discord API.
- [lavalink-client](https://github.com/freyacodes/lavalink-client): Client for interacting with a Lavalink server.
- [nodemailer](https://nodemailer.com/): For sending emails.

## License

This project is licensed under the MIT License; see the [LICENSE](LICENSE) file.
