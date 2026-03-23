# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the bot source code (TypeScript, compiled to `dist/`).
    - `src/commands/` slash command definitions.
    - `src/deploy/` deploy/destroy scripts for Discord commands.
    - `src/events/` Discord event handlers.
    - `src/lib/` core libraries and services.
    - `src/util/` shared utilities.
    - `src/types/` shared type definitions (`src/types/index.ts`).
    - `src/index.ts` app entry point.
- `Lavalink/` holds the Lavalink service files.
- `downloads/`, `logs/`, `storage/` are runtime directories and should stay out of commits.

## Build, Test, and Development Commands

- `yarn install` installs dependencies.
- `yarn build` runs `tsc` and emits JavaScript to `dist/`.
- `yarn typecheck` runs `tsc --noEmit` (typecheck only, no `dist/` output).
- `yarn lint` runs ESLint on the repo (`eslint.config.js`).
- `yarn start` runs the compiled bot (`node dist/index.js`). Run `yarn build` first (or use Docker, which builds in the image).
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
