# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the bot source code (TypeScript, compiled to `dist/`).
    - `src/commands/` slash command definitions.
    - `src/deploy/` deploy/destroy scripts for Discord commands.
    - `src/events/` Discord event handlers.
    - `src/lib/` core libraries and services.
    - `src/util/` shared utilities.
    - `src/types/` shared type definitions (`src/types/index.ts`).
    - `src/shared/` code used by **both** the bot (root `tsc` → `dist/shared/`) and the dashboard (via `@/shared/*` in `src/web/tsconfig.json` and thin re-exports under `src/web/`). Prefer adding cross-runtime logic here instead of importing `src/web/` from bot handlers.
    - `src/index.ts` app entry point.
- `src/web/` is the **Next.js dashboard** (web UI and controls). It is a **separate application** from the bot: own `package.json`, install/build commands, and **its own container image** (`Dockerfile.web`). The root TypeScript project **does not compile** `src/web` (see `tsconfig.json` `exclude` and **Web dashboard vs. bot runtime** below). The main bot image builds with **`yarn build:bot`** only.
- `Lavalink/` holds the Lavalink service files.
- `downloads/`, `logs/`, `storage/` are runtime directories and should stay out of commits.

## Web dashboard vs. bot runtime

These rules keep the **Discord bot** and the **Next.js dashboard** separate at build and deploy time, even though both live under the same repository.

- **Two applications**: Bot logic and the HTTP/WebSocket bot API live under `src/` (except `src/web/`). The dashboard and web player UI live in **`src/web/`** as its own Next.js app (`package.json`, lockfile, `next.config`, etc.).
- **Bot TypeScript scope**: Root `tsc` uses **`rootDir`: `src`** but **`exclude`: `["src/web"]`**, so **`yarn build:bot`** does not compile or emit the Next.js tree into `dist/`. The **`yarn typecheck`** script runs root **`tsc --noEmit`** (same exclusion) and then typechecks **`src/web`** as its own project.
- **Bot container**: The main **`Dockerfile`** runs **`yarn build:bot`** (not `yarn build`), so the bot image does not run the Next production build. Runtime is `node` + `dist/` + shared root deps as defined in that image.
- **Web container**: **`Dockerfile.web`** builds the dashboard (`yarn --cwd src/web build`, standalone output) and runs it as a **separate image/service** from the bot.
- **When to build what**: Use **`yarn build:bot`** for bot-only or bot image work; use **`yarn build:web`** or dashboard Docker for the UI; use **`yarn build`** for a full local/CI verification of both halves.

### Optional: moving `src/web` out of `src/`

The current layout is intentional and supported: exclusion in `tsconfig.json` plus split Dockerfiles already prevent the bot image from compiling the web app. Relocate only if the nested path causes confusion or you want a formal monorepo layout.

- **Typical target**: `web/` or `apps/web/` at the **repository root** (alongside `src/`), still versioned in the same repo.
- **What to update**: Root `package.json` scripts that use `yarn --cwd src/web` → new path; **`Dockerfile.web`** `COPY`/`WORKDIR` and paths to `.next/standalone`; any **CI/deploy** or compose files that reference `src/web`; **ESLint/Prettier** globs; Cursor rules that mention `src/web` (e.g. `next-app-no-lib.mdc`).
- **Yarn workspaces (optional)**: Add `"workspaces": ["apps/web"]` (and later `packages/bot` if you split further) so installs hoist consistently; keep **no direct TypeScript imports** from web into bot sources (the contract stays HTTP/WS and env-configured URLs).
- **Tradeoff**: Moving is a one-time path churn; benefit is a clearer boundary (`src` = bot only) and no need to remember the `exclude` for new contributors.

## Build, Test, and Development Commands

- `yarn install` installs dependencies.
- `yarn build` runs **`build:bot` and `build:web`** (full stack). **`yarn build:bot`** runs root `tsc` and emits bot JavaScript to `dist/` (Next.js is not part of this emit).
- **`yarn build:web`**, **`yarn dev:web`**, and **`yarn web:install`** operate on `src/web/` only.
- `yarn typecheck` runs root **`tsc --noEmit`**, then **`yarn web:install`**, then **`yarn --cwd src/web typecheck`** (both halves; no `dist/` emit from the root step).
- `yarn lint` runs ESLint on the repo (`eslint.config.js`).
- `yarn start` runs the compiled bot entry (`node dist/server.js` per `package.json`). Run `yarn build:bot` (or `yarn build`) first, or use Docker: the **bot** image runs `build:bot` only; the **web** image is built separately (`Dockerfile.web`).
- `yarn dev` runs `tsc --watch` and `nodemon` together so `dist/` stays up to date.
- Docker dev environment:
    - `./dev-env.sh build` builds images.
    - `./dev-env.sh up` starts services (bot + Lavalink).
    - `make up` or `make down` provides the same via Makefile shortcuts.
- Command deployment (after `yarn build`):
    - `yarn deployGlobal` / `yarn destroyGlobal`
    - `yarn deployGuild` / `yarn destroyGuild` (requires `GUILD_ID`).

## Coding Style & Naming Conventions

- TypeScript (ES modules). Imports from local modules use `.js` extensions (NodeNext). Indentation: 4 spaces.
- **Documentation:** Prefer short `/** … */` summaries on non-trivial exports. Avoid legacy JSDoc `@param {import('…')}` blocks in `.ts` files—use real TypeScript parameter types instead.
- **Shared command types** (`src/types/index.ts`): `Command` uses `SlashCommandData` (`name` + `toJSON()` for REST) and `SlashCommandExecute` (`Promise<unknown>` so handlers may return Discord reply objects). A `BotClient` type alias is exported for use in helpers.
- **`tsconfig.json`:** `strict` is on; `strictNullChecks` and `noImplicitAny` are currently **off** so older handlers stay buildable. Tightening those flags is welcome once call sites use proper guards (e.g. `interaction.inGuild()`, `GuildMember` vs API payloads) and typed parameters in `src/util/`.
- **Root `lavaNodesConfig.d.ts`:** typings for generated `lavaNodesConfig.js` (included next to `src/**/*` in `tsconfig`).
- Semicolons are disabled; see `eslint.config.js`.
- Prettier config in `.prettierrc.json` (print width 100, double quotes).
- Suggested manual checks: `yarn lint`, `yarn typecheck`, and `yarn prettier --check .`.

## Testing Guidelines

- No test framework is configured in `package.json`.
- If you add tests, keep them near `src/` and document how to run them.

## Commit & Pull Request Guidelines

- No enforced commit convention found; keep messages short and descriptive (e.g., "fix lavalink reconnect").
- PRs should include a clear summary, relevant config changes, and screenshots/logs if behavior changes.
- **CodeRabbit:** Configuration lives in `.coderabbit.yaml`. Draft PRs, titles containing `WIP` / `DO NOT MERGE` / `[skip review]`, or the GitHub label **`wip`** skip automatic reviews. Remove the label or mark the PR ready when you want a review, or comment `@coderabbitai review`. Ensure the repo has a `wip` label (create it under Issues → Labels if missing).

## Configuration & Secrets

- Local dev requires `.env` and `lavaNodesConfig.js` in the repo root.
- Use `.env.example` and `lavaNodesConfig.js.example` as templates.
- Never commit real tokens or credentials.

## Tooling & Docs

- Strongly prefer MCP server resources when available; use Context7 for library/framework documentation queries.
