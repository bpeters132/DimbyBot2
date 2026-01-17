# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the bot source code.
  - `src/commands/` slash command definitions.
  - `src/deploy/` deploy/destroy scripts for Discord commands.
  - `src/events/` Discord event handlers.
  - `src/lib/` core libraries and services.
  - `src/util/` shared utilities.
  - `src/index.js` app entry point.
- `Lavalink/` holds the Lavalink service files.
- `downloads/`, `logs/`, `storage/` are runtime directories and should stay out of commits.

## Build, Test, and Development Commands
- `npm install` or `yarn install` installs dependencies.
- `npm start` runs the bot (`src/index.js`).
- `npm run dev` runs with `nodemon` for local iteration.
- Docker dev environment:
  - `./dev-env.sh build` builds images.
  - `./dev-env.sh up` starts services (bot + Lavalink).
  - `make up` or `make down` provides the same via Makefile shortcuts.
- Command deployment:
  - `npm run deployGlobal` / `npm run destroyGlobal`
  - `npm run deployGuild` / `npm run destroyGuild` (requires `GUILD_ID`).

## Coding Style & Naming Conventions
- JavaScript (ES modules). Indentation: 2 spaces.
- Semicolons are disabled; see `.eslintrc.json`.
- Prettier config in `.prettierrc.json` (print width 100, double quotes).
- Suggested manual checks: `npx eslint .` and `npx prettier --check .`.

## Testing Guidelines
- No test framework is configured in `package.json`.
- If you add tests, keep them near `src/` and document how to run them.

## Commit & Pull Request Guidelines
- No enforced commit convention found; keep messages short and descriptive (e.g., "fix lavalink reconnect").
- PRs should include a clear summary, relevant config changes, and screenshots/logs if behavior changes.

## Configuration & Secrets
- Local dev requires `.env` and `lavaNodesConfig.js` in the repo root.
- Use `.env.example` and `lavaNodesConfig.js.example` as templates.
- Never commit real tokens or credentials.
