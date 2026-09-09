# Repository Guidelines

This repo is **two applications**. Names are in [`GLOSSARY.md`](GLOSSARY.md); load-bearing trade-offs are in [`docs/adr/`](docs/adr/). Docker, host Node, and `dev-env.sh` live in [`README.md`](README.md).

## Two applications

- **Bot** — Discord process (slash commands, playback, Bot API). Entry: [`src/server.ts`](src/server.ts) → `dist/server.js`. Do not extend leftover [`src/index.ts`](src/index.ts).
- **Dashboard** — Next.js UI in nested [`src/web/`](src/web/). Do not call it a portal, control panel, or “web app” as a second name.
- **Contract** — The Dashboard talks to the Bot over HTTP/WebSocket and env-configured URLs. Never import `src/web/` from Bot code. Logic used by both apps goes in [`src/shared/`](src/shared/).
- **Compile graphs** — Root `tsc` uses `rootDir: src` and `exclude: ["src/web"]`. `yarn build:bot` does not emit the Dashboard. Nested `src/web/` plus that exclude is the layout; do not relocate the Dashboard unless a human asks. See [ADR 0007](docs/adr/0007-two-apps-nested-dashboard.md).

## Bot placement (`src/` except `src/web/`)

- `src/commands/`, `src/events/`, `src/deploy/` — Discord surface
- `src/botApi/` — HTTP/WS handlers the Dashboard calls
- `src/repositories/` and [`prisma/`](prisma/) — persistence
- `src/lib/` — Bot runtime services (client, logger, database)
- `src/util/` — Bot helpers
- `src/shared/` — isomorphic logic for both apps (root `tsc` emits `dist/shared/`; Dashboard imports `@/shared/*`)
- `src/workers/` — isolated workers
- `src/types/` — shared command/client types (`Command` uses `SlashCommandData` + `SlashCommandExecute`; `BotClient` is exported for helpers)

## Dashboard placement (`src/web/`)

- `src/web/app/` — routes, layouts, and route-local UI only. No reusable `lib/`, `utils/`, or shared server modules under `app/`.
- `src/web/server/` — Next server-only helpers (`next/headers`, Bot API proxies) **and** all `"use server"` files as `*.actions.ts` (one concern per file or a small related group).
- `src/web/lib/` — helpers that are not Next-server-bound. **Do not add** new `"use server"` modules under `src/web/lib/actions/` (`player.actions.ts` / `playlist.actions.ts` stay until a later move).
- `src/web/components/`, `src/web/hooks/` — UI. Prefer `*.actions.ts` over `fetch("/api/...")` when the work should run on the server with cookies forwarded.
- `app/api/**/route.ts` — thin HTTP contracts; import from `@/server/*` or `@/lib/*`.

## Scripts

Use **Yarn**, not npm (`packageManager` in `package.json`).

- `yarn install` — root Bot dependencies
- `yarn web:install` — Dashboard dependencies (`src/web/`)
- `yarn build:bot` — root `tsc` → `dist/` (Dashboard is not part of this emit)
- `yarn build:web` — Dashboard production build
- `yarn build` — both apps (local/CI full stack)
- `yarn typecheck` — root `tsc --noEmit`, then `tsconfig.tests.json`, then Dashboard `tsc --noEmit`
- `yarn lint` — ESLint (`eslint.config.js`)
- `yarn prettier --check .` / `yarn prettier --write .`
- `yarn test` — `yarn test:bot` then `yarn test:web`
- `yarn start` — compiled Bot (`node dist/server.js`); build the Bot first
- `yarn dev` / `yarn dev:web` — Bot watch + nodemon; Dashboard Next dev server
- `yarn deployGlobal` / `yarn destroyGlobal` / `yarn deployGuild` / `yarn destroyGuild` — slash commands (need `dist/deploy/`; `deployGuild` needs `GUILD_ID`)

Bring-up, Compose, and Node-on-host details: [README.md](README.md).

## Coding style

- TypeScript ESM. Bot local imports use `.js` extensions (NodeNext). Indentation: 4 spaces. Semicolons off; Prettier in `.prettierrc.json` (print width 100, double quotes).
- **TSDoc:** Short `/** … */` summaries on non-obvious exports and non-trivial logic (Discord/Lavalink/security invariants). Use real TypeScript parameter and return types; do not duplicate them with `@param {import('…')}`. Skip noise on obvious getters and wrappers.
- **`strict` is on** in both tsconfigs; **`strictNullChecks` and `noImplicitAny` are off**. Leave those flags as they are unless a human asks. New code should still be well-typed (guards, no new implicit `any` at boundaries).
- Root `lavaNodesConfig.d.ts` types generated `lavaNodesConfig.js`.

## Testing

Typecheck, lint, Prettier, and tests apply to **both** the Bot and the Dashboard.

- Colocate `*.test.ts` next to the code: Bot under `src/` except `src/web/`; Dashboard under `src/web/`.
- Style: Node `node:test` + `tsx` + `node:assert/strict`.
- New features get tests. Touching untested modules should add tests. Do not skip the Dashboard because a suite is thin.
- Dashboard tests are unit tests of `server/` / `lib/` / shared helpers, not a React Testing Library suite unless asked.
- `yarn test:bot` excludes `src/web/`. `yarn test:web` uses the Dashboard tsconfig so `@/*` and `@/shared/*` resolve.

## Pull requests

Keep messages short and descriptive (e.g. `fix lavalink reconnect`). PRs need a clear summary; include config notes and screenshots or logs when behavior changes.

**CodeRabbit:** [`.coderabbit.yaml`](.coderabbit.yaml). Draft PRs, titles containing `WIP` / `DO NOT MERGE` / `[skip review]`, or the `wip` label skip automatic reviews. Remove the label or mark the PR ready to review, or comment `@coderabbitai review`.

## Configuration and secrets

Local dev needs `.env` and `lavaNodesConfig.js` in the repo root. Use `.env.example` and `lavaNodesConfig.js.example`. Never commit tokens or credentials.

## Tooling

Prefer MCP resources when available; use Context7 for library and framework docs.

After substantive code changes, run:

```bash
yarn typecheck
yarn lint
yarn prettier --check .
yarn test
```
