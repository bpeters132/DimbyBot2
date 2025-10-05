# Implementation Plan: Implement Hot Module Reloading

## 1. Summary of the Recommendation
- Introduce hot module reloading (HMR) for the Discord bot runtime so command, event, and configuration changes apply instantly during local development without restarting containers.
- Build on top of the existing Docker Compose/Nodemon workflow to minimize cold-start delays while protecting production stability.

## 2. Goals and Success Metrics
- Reduce average local edit-to-feedback cycle to ≤2 seconds for command or event updates, measured via automated stopwatch script.
- Ensure HMR updates are scoped to local development only; production builds remain untouched and stable.
- Achieve ≥90% adoption among active developers within one sprint, captured through onboarding checklist confirmations.
- Maintain zero regression in bot uptime when running under HMR compared to current nodemon-based workflow.

## 3. Technical Approach with Ordered Implementation Tasks
1. **Tooling Evaluation and Decision**
   - Compare `nodemon` enhancements, `ts-node-dev`, `tsx --watch`, and `babel-node` HMR capabilities for CommonJS/ESM compatibility with current codebase.
   - Validate integration with Docker bind mounts defined in [`docker-compose.dev.yml`](docker-compose.dev.yml:1) and entry workflow in [`dev-env.sh`](dev-env.sh:1).
   - Select toolset (recommended: `tsx --watch` combined with a lightweight reloader harness) and document rationale in engineering notes.
2. **Hot Reload Harness**
   - Create [`src/dev/runtime/hmrBootstrap.js`](src/dev/runtime/hmrBootstrap.js) that loads [`src/index.js`](src/index.js:1), watches for file changes, clears module cache, and reinitializes the bot client gracefully.
   - Implement targeted reload logic for commands/events by invoking existing loaders ([`src/util/loadCommands.js`](src/util/loadCommands.js:1), [`src/util/loadEvents.js`](src/util/loadEvents.js:1)) while preserving shared client state (e.g., Lavalink connections when safe).
   - Add safety fallbacks that trigger full process restart if reinitialization fails to prevent unexpected zombie state.
3. **Configuration Updates**
   - Add `yarn dev:hmr` script in [`package.json`](package.json:1) pointing to the new runner (`tsx watch src/dev/runtime/hmrBootstrap.js` or equivalent).
   - Modify [`docker-compose.dev.yml`](docker-compose.dev.yml:1) to run `yarn dev:hmr` for the `dimbybot` service and ensure `NODE_ENV=development` remains set.
   - Extend [`dev-env.sh`](dev-env.sh:1) with `hmr` command alias (`./dev-env.sh hmr` → `docker compose ... run yarn dev:hmr`) and update usage help text.
4. **State Preservation and Cleanup**
   - Implement module-level teardown hooks so the bot disconnects cleanly before reload (e.g., stop command handlers, flush scheduled tasks).
   - Guard against stale listeners by tracking active event subscriptions in [`src/lib/BotClient.js`](src/lib/BotClient.js:1) and removing them prior to re-registering.
5. **Production Safeguards**
   - Gate HMR setup behind `ENABLE_HMR` environment variable defaulting to `false`; ensure production compose (`docker-compose.yml`) never sets it.
   - Add CI assertion checking that release bundles omit `dev/runtime` assets to keep production Docker image lean.
6. **Developer Documentation and Training**
   - Update README “Local Development Setup” section with instructions for `dev:hmr`, outlining limitations (e.g., persistent state resets).
   - Produce quickstart snippet in `docs/` (e.g., `docs/suggestions/hmr-usage-guide.md` if further detail is required later), referencing onboarding checklist.

## 4. Required Resources, Dependencies, and Stakeholder Coordination
- **Resources:** Additional NPM dev dependencies (`tsx`, optional watchers), updates to Docker images, documentation time.
- **Dependencies:** Node.js 20 features in [`Dockerfile.dev`](Dockerfile.dev:1), compatibility with existing debugging plan (`docs/suggestions/debugging-support-config.md`), and configuration layering plan in [`docs/suggestions/environment-specific-configs.md`](docs/suggestions/environment-specific-configs.md).
- **Stakeholders:** Backend developers (primary users), DevOps team (Docker composition changes), QA (smoke tests), onboarding coordinators (checklist updates).

## 5. Timeline or Prioritization Notes
- Estimated effort: ~1.5 engineering days.
  1. Day 1 morning: tool evaluation and harness prototype.
  2. Day 1 afternoon: Docker/`dev-env.sh` integration and state cleanup hooks.
  3. Day 2 morning (buffer): documentation, peer review, and adoption training.
- Schedule after environment-specific configuration (Recommendation O) to leverage new config gating, and before debugging support rollout to avoid conflicting compose changes.

## 6. Potential Risks and Mitigation Strategies
- **Incomplete Module Teardown Leading to Memory Leaks:** Implement standardized teardown hooks and run soak tests (continuous reload for 30 minutes) to detect leaks.
- **Inconsistent State Between Reloads (e.g., Lavalink sessions):** Provide explicit warnings that playback resets after reload; offer optional persistence toggle only for advanced users.
- **Toolchain Incompatibility with Future TypeScript Adoption:** Select HMR tooling that supports both JS and TS to avoid future migration blockers (e.g., `tsx`).
- **Developer Confusion Between HMR and Standard Dev:** Document command comparison table and maintain `dev` fallback for debugging edge cases.

## 7. Testing and Validation Strategy
- **Automated Smoke Script:** Add `scripts/test-hmr.mjs` to trigger file changes and assert bot responds to reload events with <2 second downtime.
- **Manual QA:** Run side-by-side comparison: `yarn dev` vs. `yarn dev:hmr` using sample command edits (e.g., [`src/commands/music/Queue.js`](src/commands/music/Queue.js:1)) and confirm command availability without manual restarts.
- **Container Validation:** Execute `./dev-env.sh hmr` on macOS/Linux hosts to ensure volume mounts and reload watchers behave consistently.
- **Regression Checks:** Confirm production Docker build excludes HMR dependencies by inspecting image layers and running deployment smoke tests.
