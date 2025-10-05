# Implementation Plan: Add Progress Indicators for Long Operations

## 1. Summary of the Recommendation
- Introduce user-facing progress indicators for commands and workflows that take longer than a few seconds (e.g., `/download`, playlist imports, Lavalink node reconnection) to enhance transparency and reduce perceived latency.
- Standardize a progress-reporting utility that harmonizes Discord interaction updates, logging hooks, and optional control channel feedback.

## 2. Goals and Success Metrics
- Identify all long-running operations and ensure each provides periodic status updates (minimum every 5 seconds or at key milestones).
- Reusable progress helper publishes updates via `interaction.editReply`, control channel embeds, and logger instrumentation.
- Measurable drop in user-reported uncertainty or duplicate command invocations (tracked via support logs) within two weeks of deployment.
- Zero increase in Discord rate-limit warnings attributable to progress updates.

## 3. Technical Approach with Ordered Implementation Tasks
1. Catalogue candidate operations:
   - Review existing workflows such as [`src/commands/user/download.js`](src/commands/user/download.js:1), playlist loading in [`handleQueryAndPlay`](src/util/musicManager.js:1), bulk queue clearing, or remote Lavalink failover tasks.
   - Document expected duration, typical milestones, and failure modes.
2. Define a progress reporting contract:
   - Design TypeScript-esque interface (even within JS) for a `ProgressReporter` utility covering `start`, `update(step, meta)`, `complete`, `error`.
   - Decide default channels for output: interaction reply, optional follow-up message, control channel message, logging.
3. Implement helper module in `src/util/`:
   - Create `progressReporter.js` with factories for interaction-based and message-based contexts, fallback to logger-only mode when interactions are unavailable.
   - Support throttling to avoid Discord rate limits (e.g., suppress updates <2 seconds apart unless forced).
4. Integrate with `/download` command:
   - Replace inline `createProgressBar` usage in [`download.js`](src/commands/user/download.js:13) with the new reporter.
   - Surface additional milestones (queued, metadata write, playback initiation).
5. Expand to other operations:
   - Update playlist actions in [`musicManager.js`](src/util/musicManager.js:1) to show progress when handling large search results or playlist loads (e.g., loading tracks, queueing, connecting voice).
   - Consider interactions in [`src/commands/music/Queue.js`](src/commands/music/Queue.js:18) for long queue pagination recalculations or extended fetch operations.
6. Add configuration toggles:
   - Provide environment flag `ENABLE_PROGRESS_UPDATES` or per-command settings to disable indicators in specific guilds (store in persistent settings if available).
7. Update control channel workflow:
   - Modify handlers in [`src/events/handlers/handleControlChannel.js`](src/events/handlers/handleControlChannel.js:1) to post ephemeral embeds summarizing progress for monitored actions.
8. Documentation and operator guidance:
   - Extend [`README.md`](README.md:1) with explanation of progress features and configuration.
   - Update [`docs/code-review.md`](docs/code-review.md:1) appendix or new doc summarizing where progress indicators exist.
9. Deployment checklist:
   - Ensure logger configuration handles new info-level messages.
   - Verify test/staging guild has commands updated for user acceptance testing.

## 4. Required Resources, Dependencies, and Stakeholder Coordination
- Dependencies: Discord interaction access, logging utilities, existing command modules.
- Resources: UX review for message copy, design input for embed styling.
- Stakeholders:
  - Bot maintainers for utility implementation.
  - QA team for validation across various Discord guild contexts.
  - Support team for messaging updates.

## 5. Timeline or Prioritization Notes
- Estimated effort: 2–3 days of development plus 1 day for testing/documentation.
- Execute in two phases: helper creation/integration for `/download`, followed by rollout to other operations in subsequent sprint if needed.
- Prioritize operations with highest user complaints (download and playlist loads first).

## 6. Potential Risks and Mitigation Strategies
- 🌐 Rate limits: Implement throttling and batching to limit edit operations; maintain fallback to simple “in progress” message on rate-limit response.
- 🔁 Concurrency conflicts: When multiple updates race to edit the same message, queue update promises to ensure ordering.
- 🔇 Unavailable interaction context: Fallback gracefully to channel messages or logs if the original interaction has expired.
- ❌ Progress messages persisting after failure: Ensure `error()` state edits message with failure notice and disables buttons/controls.

## 7. Testing and Validation Strategy
- Unit-style tests for progress helper (mock Discord interaction object, ensure throttling logic).
- Manual QA in a staging guild:
  - `/download` success and failure cases, verifying progress increments and final state messages.
  - Playlist import with varying sizes to ensure updates remain responsive.
- Regression checks:
  - Confirm command handlers still respect ephemeral vs. public message requirements.
  - Monitor Discord rate-limit logs during load testing.
- Post-deployment monitoring through logging dashboards to detect abnormal error rates or user feedback spikes.