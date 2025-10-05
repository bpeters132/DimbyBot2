# Implementation Plan: Use GitHub Actions Cache for Docker Layers

**Status: IMPLEMENTED** - This recommendation has been implemented with enhanced cache persistence and scope management. See workflow telemetry in GitHub Actions summaries and cache troubleshooting guide for operational details.

## 1. Recommendation Summary
- Enable GitHub Actions cache backends for Docker layers so that subsequent workflow runs reuse previously built layers rather than rebuilding from scratch.
- Integrate caching with the refactored multi-stage Dockerfiles and dependency caching (Recommendations E and F) while keeping the development workflow (Docker Compose with live bind-mounts driven by [`Makefile`](Makefile:1)) unaffected.
- Preserve compatibility with the existing production deployment pipeline in [`deploy.yml`](.github/workflows/deploy.yml:1), which builds images and redeploys via remote Docker Compose.

## 2. Goals and Success Metrics
- Reduce total runtime of the `build-and-push` job by at least 30% on cache-hit runs measured across five master-branch executions.
- Achieve consistent cache hit ratios (>=70%) for both bot and Lavalink images when inputs are unchanged.
- Maintain determinism: cache usage must never produce images that differ from uncached builds (verified via digest comparison and smoke tests).
- Provide observable cache diagnostics (hit/miss messages) in workflow logs for maintainers.

## 3. Technical Approach and Ordered Implementation Tasks
1. **Prerequisite alignment**
   - Confirm Recommendations E and F (multi-stage builds and dependency cache) are merged so Docker layers have clear, cacheable boundaries.
   - Verify [`Dockerfile`](Dockerfile:1) and [`Lavalink/Dockerfile`](Lavalink/Dockerfile:1) generate consistent build contexts (clean `.dockerignore` entries).
2. **Configure Buildx with cache exporters**
   - Add `docker/setup-buildx-action@v3` to `build-and-push` job for advanced caching features.
   - Use `docker/login-action` (already present) before builds to avoid registry auth issues during cache imports.
3. **Update build steps to `docker/build-push-action`**
   - Replace raw `docker build` commands with `docker/build-push-action@v5`, configuring:
     - `cache-from: type=gha,scope=dimbybot2-bot` and equivalent for Lavalink.
     - `cache-to: type=gha,mode=max,scope=dimbybot2-bot` to persist caches between runs.
     - Build arguments aligning with Recommendation E (e.g., `BUILDKIT_INLINE_CACHE=1` if necessary).
     - Tagging with both `latest` and commit SHA to retain traceability.
4. **Handle conditional builds**
   - Respect existing `skip_build` input by short-circuiting cache steps when builds are skipped.
   - Ensure the deploy job still has access to cached layers if triggered immediately after a cached build.
5. **Introduce cache validation and fallback**
   - Generate log statements (via `--progress=plain` or action outputs) to show cache hit ratios.
   - Implement safeguards: if cache restoration fails, builds must continue from scratch without error.
6. **Documentation and runbook updates**
   - Update README CI/CD section with instructions on purging caches (e.g., modifying cache scope or using the Actions cache UI).
   - Document interaction with Recommendations E/F so contributors understand when caches invalidate.
7. **Monitoring and iteration**
   - After rollout, monitor GitHub Actions Insights for build duration trends and adjust cache scope (per-branch vs. shared) to balance reliability and hit rates.

## 4. Required Resources, Dependencies, and Stakeholder Coordination
- **Resources:** GitHub Actions cache storage capacity, ability to modify workflow YAML, registry access for pulling cached layers.
- **Dependencies:** Completion of Recommendations E and F, coordination with DevOps to ensure server-side deploy script remains compatible.
- **Stakeholders:** DevOps engineers (workflow maintainers), backend developers (Dockerfile reviewers), QA (validating cached builds in staging), release managers (monitoring pipeline SLAs).

## 5. Timeline and Prioritization Notes
- Estimated effort: 1–1.5 engineering days.
  1. Half-day for workflow refactor and preliminary tests.
  2. Half-day for documentation, validation, and adjustments after first cached run.
  3. Buffer for tuning cache scope or troubleshooting runner-specific issues.
- Execute immediately after Recommendations E and F to maximize layer reuse.

## 6. Potential Risks and Mitigation Strategies
- **Cache corruption or mismatched layers:** Mitigate by scoping caches per image (`dimbybot2-bot`, `dimbybot2-lavalink`) and validating digests post-build; offer manual cache bust via workflow input.
- **Cache size limits:** Monitor GitHub cache usage; if limits are reached, implement scheduled cache pruning or reduce `mode` from `max` to `min`.
- **Inconsistent runner environments:** Pin Buildx version and Docker CLI via setup actions; include fallback to rebuild from scratch when cache restore fails.

## 7. Testing and Validation Strategy
- **Dry-run builds:** Trigger workflow on a feature branch twice; confirm second run shows cache hits and shorter durations.
- **Staging deployment:** Deploy cached images to staging server via existing pipeline, run playback smoke tests to verify functional equivalence.
- **Regression monitoring:** Compare SHA digests between cached and uncached builds; ensure the deploy job pulls correct images.
- **Ongoing telemetry:** Track build duration metrics and cache hit rates for two weeks post-implementation and adjust scopes if hit rates fall below targets.