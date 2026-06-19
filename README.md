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

- **Local dev (optional):** Node.js 24+ if you run `yarn dev` / `yarn typecheck` on the host (`engines` in `package.json`; `.nvmrc` is only for tools like nvm—not required on the server)
- **Docker / production:** Node comes from the image (`node:24-*` in `Dockerfile` / `Dockerfile.web`); the host does not need Node or nvm installed
- [Yarn](https://yarnpkg.com/) (this repo uses Yarn 1.x; see `packageManager` in `package.json`)
- **Docker Compose v2.24.4 or newer** if you use `./dev-env.sh` / `docker-compose.dev.yml` (the dev override uses `ports: !override`, which requires that Compose version). If you see `unknown tag !override`, upgrade the Compose V2 plugin: [Docker Compose install](https://docs.docker.com/compose/install/linux/) / update Docker Desktop.

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

Dev splits **backend in Docker** from the **dashboard on the host**:

| Piece                   | Where it runs                                            | How                                                                                             |
| ----------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Bot, Lavalink, Postgres | Docker (`docker-compose.yml` + `docker-compose.dev.yml`) | `./dev-env.sh build` then `./dev-env.sh up` (or `yarn docker:dev:build` / `yarn docker:dev:up`) |
| Next.js dashboard       | **Host** (not in the dev compose stack)                  | `yarn web:install` then `yarn dev:web`                                                          |

Production is different: the dashboard is the separate `dimbybot-web` container (`docker-compose.dashboard.yml` + `Dockerfile.web`). Do not expect `dimbybot-web` when using the dev compose files.

1.  **Prerequisites:** Docker (Compose v2.24.4+ for dev overrides) and, for the portal, Node.js 24+ on the host if you run `yarn dev:web` outside Docker.
2.  **Environment:** Copy `.env.example` to `.env` and fill values. The bot container reads this via compose; `yarn dev:web` uses the same root `.env` / `src/web/.env` patterns as documented in `.env.example`.
3.  **Backend stack:**

    ```bash
    ./dev-env.sh build
    ./dev-env.sh up
    ```

    Bot HTTP API defaults to `http://127.0.0.1:3001` (`BOT_API_PORT`). Postgres is published on `127.0.0.1:5432` in dev.

4.  **Web portal (separate terminal, on the host):**

    ```bash
    yarn web:install
    yarn dev:web
    ```

    Dashboard defaults to `http://localhost:3000` (`BETTER_AUTH_URL` in compose points here).

5.  **Smoke-check before deploy:** Confirm containers are healthy (`docker compose … ps`, bot `GET /health` on `BOT_API_PORT`), then load the dashboard and sign in. Fix the Docker stack first; only then validate production images.

`lavaNodesConfig.js` is optional in Docker dev—the entrypoint can generate it from compose env vars.

## Usage

- **Run backend locally (Docker):**

    ```bash
    ./dev-env.sh up
    ```

- **Run dashboard locally (host):** `yarn dev:web` (with the Docker stack already up).

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
- [nodemailer](https://nodemailer.com/): Optional; only required if you re-enable the disabled `/suggest` command.

## License

This project is licensed under the MIT License; see the [LICENSE](LICENSE) file.
