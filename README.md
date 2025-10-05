# DimbyBot2

A Discord bot for friends! Rewritten in Node.js.

## About

This project is a rewrite of the original DimbyBot using Node.js and the discord.js library.
Author is just a dude that can barely code but can figure things out.

## Features

* Music
* Single simple clear command
* More to come

## Prerequisites

*   Node.js - current LTS
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

## Configuration (Deployment via GitHub Actions CI/CD)

For optimal deployment to a destination server, this project uses GitHub Actions CI/CD.

1.  **Fork this repository** on GitHub.
2.  In your forked repository's GitHub settings, navigate to **Settings > Secrets and variables > Actions**.
3.  Define the following repository secrets required by the bot:
    ```
    BOT_TOKEN=your_discord_bot_token
    CLIENT_ID=your_discord_client_id
    GUILD_ID=your_discord_guild_id
    OWNER_ID=your_discord_owner_id
    DEV_MODE=false
    LOG_LEVEL=info
    LAVALINK_HOST=your_lavalink_host
    LAVALINK_PORT=2333
    LAVALINK_PASSWORD=youshallnotpass
    LAVALINK_NODE_ID=node1
    LAVALINK_SECURE=false
    LAVALINK_YOUTUBE_POT_TOKEN=your_youtube_pot_token
    LAVALINK_YOUTUBE_POT_VISITORDATA=your_visitor_data
    LAVALINK_SPOTIFY_ENABLED=true
    LAVALINK_SPOTIFY_CLIENT_ID=your_spotify_client_id
    LAVALINK_SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    LAVALINK_SPOTIFY_COUNTRY_CODE=US
    LAVALINK_SPOTIFY_PLAYLIST_LOAD_LIMIT=6
    LAVALINK_ALBUM_LOAD_LIMIT=6
    EMAIL_USER=your_email
    EMAIL_PASS=your_email_password
    GITLAB_EMAIL=your_gitlab_email
    DEPLOY_SERVER_HOST=your_server_host
    DEPLOY_SERVER_USER=your_server_user
    SSH_PRIVATE_KEY=your_ssh_private_key
    DEPLOY_SERVER_SSH_PORT=22
    GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}
    ```
    **Note:** These secrets are used by the GitHub Actions workflow in `.github/workflows/deploy.yml` for building and deploying the bot.

### Dependency Caching

The CI/CD pipeline implements comprehensive caching to accelerate builds:

- **Yarn Cache**: Dependencies are cached using `actions/setup-node` with `cache: 'yarn'`. Cache hits typically reduce install time to under 90 seconds.
- **Docker Layer Caching**: BuildKit is used with configurable caching strategies for Docker layers:
  - **GitHub Actions Cache**: Primary caching method using `type=gha` with configurable scopes (shared/branch/environment).
  - **Registry Fallback**: When GHA cache is disabled or invalidated, falls back to registry inline caching using previous image tags.
  - **Cache Scopes**:
    - `shared`: Uses fixed scopes (`dimbybot2-bot`, `dimbybot2-lavalink`) for all builds.
    - `branch`: Scopes cache by branch name (e.g., `master-bot`).
    - `environment`: Scopes cache by deployment environment name (requires `deploy_environment` input).
- **Workflow Dispatch Inputs**:
  - `enable_docker_cache` (boolean, default: true): Enable/disable Docker layer caching.
  - `cache_scope_mode` (choice: shared/branch/environment, default: shared): Select cache scope strategy.
  - `deploy_environment` (string, optional): Environment name for environment-scoped caching.
  - `invalidate_caches` (boolean, default: false): Force fresh builds without cache restoration.
- **Cache Invalidation**: Use `invalidate_caches: true` to bypass all caches, or disable `enable_docker_cache` for registry-only caching.
- **Cache Telemetry**: Build summaries show cache mode, scope, and hit/miss status for both Yarn and Docker caches.

If dependency changes cause issues, trigger a cache bust via workflow dispatch with `invalidate_caches: true` or disable Docker caching with `enable_docker_cache: false`.

## Local Development Setup

If you want to run the bot locally for development or testing:

1.  **Prerequisites:** Ensure you have Docker installed and running on your machine.
2.  **Environment Variables:** Create a `.env` file in the root directory. This file **is required** for local development. Add the necessary variables (referencing the list in the Configuration section or a potential `.env.example`) and fill in the values for your local setup.
3.  **Lavalink Configuration:** Create a `lavaNodesConfig.js` file in the root directory. This file defines the connection details for your local Lavalink server. *(You may need to refer to existing examples or documentation for the required structure of this file).*
4.  **Build & Run Docker Environment:** Execute the development environment script:
    ```bash
    ./dev-env.sh build
    ```
    This script should build the necessary Docker images (including the bot and Lavalink) and start the containers.

## Usage

*   **Run locally (using Docker setup):**
    ```bash
    ./dev-env.sh up
    ```
*   **Deploy Slash Commands (run locally or via CI/CD):**
    *   Globally: `npm run deployGlobal`
    *   To a specific guild: `npm run deployGuild` (requires `GUILD_ID` environment variable)
    *   Can be run in your local terminal
*   **Remove Slash Commands (run locally or via CI/CD):**
    *   Globally: `npm run destroyGlobal`
    *   From a specific guild: `npm run destroyGuild` (requires `GUILD_ID` environment variable)
    *   Can be run in your local terminal

## Code Quality

This project includes linting, formatting, and markdown linting tools to maintain code quality.

### Commands

- `yarn lint` or `make lint`: Run ESLint on source files
- `yarn lint:fix` or `make lint-fix`: Run ESLint with auto-fix
- `yarn format` or `make format`: Format files with Prettier
- `yarn format:check` or `make format-check`: Check formatting without changes
- `yarn markdownlint` or `make markdownlint`: Lint markdown files
- `yarn lint:all` or `make lint-all`: Run all linting and formatting checks

### Optional Pre-commit Hooks

To enable automatic linting on commits:

```bash
yarn hooks:setup
```

To remove hooks:

```bash
yarn hooks:remove
```

Hooks are opt-in and not required for development.

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
*   [nodemailer](https://nodemailer.com/): For sending emails.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details (if one exists) or refer to `package.json`.
