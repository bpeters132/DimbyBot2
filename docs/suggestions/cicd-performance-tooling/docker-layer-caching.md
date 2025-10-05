# Implementation Plan: Use Docker Layer Caching

## 1. Recommendation Summary
- Implement multi-stage Docker builds for the production bot and Lavalink images so that dependency and tooling layers are reused between builds.
- Reconfigure the GitHub Actions workflow to leverage Docker BuildKit layer caching instead of rebuilding every layer with each push.
- Keep the existing development workflow (Docker Compose driven via [`Makefile`](Makefile:1) with live bind-mounts) unaffected while accelerating production image rebuilds.

## 2. Goals and Success Metrics
- Reduce average build duration in [`CI/CD`](.github/workflows/deploy.yml:1) by at least 40% compared to the current baseline (measure across three master-branch pushes).
- Ensure identical runtime behavior of the generated images by running integration smoke tests against the cached-build output.
- Maintain image size parity (±5%) relative to the pre-change images by pruning build-only artifacts in the final stage.
- Provide clear build diagnostics showing cache hits/misses in workflow logs for traceability.

## 3. Technical Approach and Ordered Implementation Tasks
1. **Baseline analysis**
   - Capture current build times and image sizes from the existing workflow logs.
   - Run local `docker build` against [`Dockerfile`](Dockerfile:1) and [`Lavalink/Dockerfile`](Lavalink/Dockerfile:1) to confirm layer structure and identify non-cacheable steps (e.g., `RUN yarn install --production`).
2. **Design the multi-stage layout**
   - Define stages: `base` (system deps + shared tools like `yt-dlp`), `deps` (install Node.js dependencies), `builder`/`runtime`.
   - Sketch the desired stage graph documenting which layers are expected to remain stable (store under `docs/suggestions/` if a visual aid is helpful).
3. **Refactor production [`Dockerfile`](Dockerfile:1)**
   - Convert to BuildKit-friendly multi-stage structure with clearly separated dependency layer.
   - Mount `node_modules` artifacts from the `deps` stage into the runtime stage, copying only the compiled JS and production deps.
   - Move `dos2unix` and `chmod` steps into appropriate stages to avoid invalidating the dependency cache.
4. **Review [`Lavalink/Dockerfile`](Lavalink/Dockerfile:1)**
   - Ensure Lavalink image benefits from similar layer separation (e.g., dependency download vs. runtime copy).
   - Align naming conventions and stage reuse where possible for clarity.
5. **Adjust ignore patterns and build context**
   - Update [`.dockerignore`](.dockerignore:1) to exclude CI artifacts, documentation, and local volumes that would otherwise invalidate caches.
   - Confirm dev-only files remain available via bind mounts in [`docker-compose.dev.yml`](docker-compose.dev.yml:1).
6. **Enable BuildKit caching in GitHub Actions**
   - Introduce `docker/setup-buildx-action` and `docker/build-push-action` steps in [`deploy.yml`](.github/workflows/deploy.yml:1) with `cache-from: type=gha` and `cache-to: type=gha,mode=max`.
   - Remove plain `docker build` invocations and ensure tags (`latest` + commit SHA) are still published.
7. **Verify local developer workflow**
   - Run `make up` ([`Makefile`](Makefile:1)) to confirm development containers still mount the local codebase (`- ./:/app`) and pick up edits instantly.
   - Document any required updates to [`Dockerfile.dev`](Dockerfile.dev:1) to keep parity with the new production stages (e.g., referencing shared base stage).
8. **Documentation and knowledge transfer**
   - Update [`README.md`](README.md:1) CI/CD section to describe caching expectations and troubleshooting steps.
   - Prepare a short “How caching works” runbook for maintainers in `docs/suggestions/` if ongoing monitoring is needed.

## 4. Required Resources, Dependencies, and Stakeholder Coordination
- **Resources:** GitHub Actions administrative access, container registry quota, staging server for integration checks.
- **Dependencies:** Cooperation with infra engineers responsible for deployment scripts, availability of historic pipeline metrics to compare improvements.
- **Stakeholders:** DevOps/infra maintainers (workflow updates), backend developers (Dockerfile refactor review), QA (functional smoke tests on cached builds).

## 5. Timeline and Prioritization Notes
- Estimated effort: 2–3 engineering days.
  1. Day 1: Baseline measurement and Dockerfile refactor spikes.
  2. Day 2: Workflow updates, documentation, and internal reviews.
  3. Day 3 (buffer): Staging verification and follow-up fixes.
- Prioritize this change before Recommendations F and G, as the multi-stage structure enables effective dependency and GitHub cache usage.

## 6. Potential Risks and Mitigation Strategies
- **Cache invalidation pitfalls:** Non-deterministic commands (e.g., `pip install latest`) may bust caches; pin tool versions and surface warnings in review.
- **Runtime drift:** Multi-stage refactors might omit files required at runtime; mitigate via staging deployments and a file-diff between old/new images.
- **BuildKit availability issues:** If GitHub runners face BuildKit problems, fall back to standard `docker build` behind a feature flag while investigating.

## 7. Testing and Validation Strategy
- **Local validation:** Run `docker build` with `DOCKER_BUILDKIT=1` and ensure subsequent builds use cache as expected (inspect with `--progress=plain`).
- **CI verification:** Execute a temporary workflow run post-merge to confirm cache persistence between jobs and artifacts, logging cache hit counts.
- **Functional smoke tests:** Deploy via existing pipeline to staging, run regression command suite (playback, Lavalink connectivity), and monitor logs for anomalies.
- **Monitoring:** Track build duration metrics in GitHub Actions insights for two weeks to confirm sustained improvements.