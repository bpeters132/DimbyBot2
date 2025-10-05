# Implementation Plan: Add Playlist Persistence with JSON Storage

## 1. Summary of the Recommendation
- Introduce durable storage for user-created playlists using a JSON-backed store so playlists survive bot restarts, deploys, and crashes.
- Provide command, control-channel, and developer tooling updates that allow saving, loading, listing, and deleting playlists while keeping the storage format compatible with a future database migration.

## 2. Goals and Success Metrics
- Persist playlists across sessions with average read/write latency under 150 ms for typical guild usage (<100 playlists per guild).
- Deliver `/playlist save|load|list|delete` slash commands with success and error handling surfaced to end users.
- Maintain data integrity: zero corrupt playlist records after 1,000 concurrent operations in automated testing.
- Provide a seamless migration path to database storage (captured in documentation) without breaking existing JSON playlists.

## 3. Technical Approach with Ordered Implementation Tasks
1. **Requirements & Data Model Definition**
   - Inventory current queue and track data flows in [`src/util/musicManager.js`](src/util/musicManager.js:1) and `/playlist` command scaffolding (none yet).
   - Define JSON schema: top-level map keyed by guild ID, then user ID (for ownership) with playlist arrays containing track metadata (`title`, `uri`, Lavalink `encodedTrack`, timestamps).
   - Document storage location (e.g., `data/playlists.json`) and rotation strategy in `docs/`.

2. **Storage Abstraction Layer**
   - Create `src/lib/storage/jsonStore.js` handling atomic read/write operations with file locking (use `fs.promises` plus `flock` or write-temp-and-rename approach).
   - Build `src/lib/storage/playlistStore.js` exposing CRUD methods (`savePlaylist`, `getPlaylist`, `listPlaylists`, `deletePlaylist`) that wrap the JSONStore and enforce quotas.

3. **Command Suite Implementation**
   - Scaffold `/playlist` command in `src/commands/user/Playlist.js` using Discord.js slash subcommands.
   - Integrate with existing player utilities to serialize current queue (`player.queue.tracks` from [`src/util/musicManager.js`](src/util/musicManager.js:1)).
   - Ensure ephemeral responses for errors, persistent embeds for success, and optional preview of playlist contents.

4. **Control Channel & Developer Tooling Updates**
   - Amend control channel handler ([`src/events/handlers/handleControlChannel.js`](src/events/handlers/handleControlChannel.js:1)) to display when a loaded queue originated from a saved playlist.
   - Add developer command options (e.g., `/playerctl playlist-info`) to aid debugging.

5. **Lifecycle & Maintenance Utilities**
   - Provide CLI scripts (`yarn playlist:export`, `yarn playlist:validate`) under `scripts/` for backup and integrity checks.
   - Implement cron-style cleanup function (invoked at startup) to prune stale playlists based on configurable retention.

6. **Documentation & Migration Notes**
   - Author `docs/suggestions/playlist-json-storage-guide.md` (supporting doc if needed) describing file structure, manual edit precautions, and future migration steps.
   - Update `README.md` feature list and operator instructions for backups.

## 4. Required Resources, Dependencies, and Stakeholder Coordination
- **Resources:** Node.js filesystem utilities, optional `proper-lockfile` package for file locking, staging guild for feature validation.
- **Dependencies:** Existing queue management (`musicManager`), environment-specific config plan (`docs/suggestions/environment-specific-configs.md`) for storage path configuration.
- **Stakeholders:** Bot maintainers (implementation), DevOps (backup scheduling), Community managers (user communication), QA (multi-guild regression testing).

## 5. Timeline or Prioritization Notes
- Estimated effort: ~3 engineering days.
  1. Day 1: Requirements finalization, storage abstraction, schema validation utilities.
  2. Day 2: Slash command implementation, control channel integration, CLI utilities.
  3. Day 3: Automated tests, documentation updates, review, and staging rollout.
- Schedule after environment-specific configuration (Recommendation O) to leverage centralized storage path configuration, before advanced queue visualization to ensure saved playlists feed richer embeds.

## 6. Potential Risks and Mitigation Strategies
- **Concurrent Writes Causing Corruption:** Use atomic write strategy (write to temp file then rename) and introduce per-guild mutex to serialize writes.
- **File Growth and Performance Degradation:** Enforce per-user and per-guild playlist count limits, provide compaction routine, and monitor file size with alerting.
- **Unauthorized Access or Tampering:** Store files outside web root, restrict filesystem permissions, and avoid embedding sensitive data.
- **Migration Complexity to DB Later:** Maintain schema documentation and create export scripts so JSON data can be imported into SQL when ready.

## 7. Testing and Validation Strategy
- **Unit Tests:** Cover storage abstractions (simulated concurrent writes, integrity validation), playlist command handlers (mock interactions).
- **Integration Tests:** Use temporary filesystem sandbox to execute save/load/list/delete end-to-end with queued tracks.
- **Stress Tests:** Simulate concurrent playlist operations across multiple guilds with worker scripts to confirm locking strategy.
- **Manual QA:** Validate commands on desktop/mobile, ensure control channel indicators update correctly, confirm persistence after bot restart.
- **Operational Checks:** Run `playlist:validate` in CI and before deployments to detect JSON corruption, schedule nightly backups in staging before production rollout.