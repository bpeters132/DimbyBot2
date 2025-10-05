# Implementation Plan: Add Build Caching for Dependencies

## 1. Recommendation Summary
- Introduce deterministic caching strategies for Node.js dependencies to accelerate production image builds and GitHub Actions pipeline runs.
- Reuse dependency artifacts across Docker build stages and GitHub runners without disrupting the development workflow that relies on live bind-mounts via [`docker-compose.dev.yml`](docker-compose.dev.yml:1).
- Complement the multi-stage Docker refactor from [Use Docker Layer Caching](docs/suggestions/docker-layer-caching.md:1) by ensuring dependency layers remain stable and easily reusable.

## 2. Goals and Success Metrics
- Reduce the `yarn install` step in [`CI/CD`](.github/workflows/deploy.yml:1) to under 90 seconds on cache hits (baseline to be captured before implementation).
- Guarantee reproducible dependency sets by locking to `yarn.lock` and verifying integrity hashes within the pipeline.
- Maintain separation between production (pruned) and development (full) dependency sets, with zero regressions in hot-reload behavior for `make up` ([`Makefile`](Makefile:1)) workflows.
- Provide actionable cache hit/miss telemetry in build logs to simplify troubleshooting.

## 3. Technical Approach and Ordered Implementation Tasks
1. **Baseline capture and audit**
   - Record current dependency install times across three pipeline runs.
   - Inventory dependency usage patterns (native modules, post-install scripts) that could invalidate caches.
2. **Stabilize dependency inputs**
   - Ensure [`package.json`](package.json:1) and [`yarn.lock`](yarn.lock:1) are the sole determinants of dependency content.
   - Enforce deterministic installs by adding `yarn config set enableImmutableInstalls true` in CI and documenting contribution guidelines.
3. **Refine Docker dependency stage**
   - Align the new `deps` stage from Recommendation E to copy only `package.json`/`yarn.lock` before running `yarn install --frozen-lockfile`, allowing Docker to reuse this layer whenever the lockfile is unchanged.
   - Cache `node_modules` under `/app/node_modules` and copy it into the runtime stage with `--production` pruning.
4. **Configure GitHub Actions dependency cache**
   - Replace standalone `yarn install` steps with `actions/setup-node@v4` using `cache: 'yarn'` keyed on `${{ runner.os }}-yarn-${{ hashFiles('yarn.lock') }}`.
   - Add a follow-up verification step that outputs cache hit status and runs `yarn install --immutable` to ensure consistency.
5. **Support Docker BuildKit cache exports**
   - Couple Recommendation E’s BuildKit adoption with `--build-arg BUILDKIT_INLINE_CACHE=1` or `cache-from/cache-to` options so the dependency layer persists between builds run on GitHub runners.
   - Document workflow ordering to pull previous images (or use `type=gha`) before building the next one.
6. **Local developer safeguards**
   - Validate `make up` to confirm the anonymous `/app/node_modules` volume remains functional and unaffected by production caching rules.
   - Provide a fallback script or documentation section on how to flush caches when developers intentionally bump dependencies.
7. **Documentation updates**
   - Extend the README CI/CD section to describe cache behavior, expected speedups, and cache invalidation triggers.
   - Draft troubleshooting tips (e.g., when cache corruption occurs) for the engineering runbook in `docs/suggestions/` if necessary.

## 4. Required Resources, Dependencies, and Stakeholder Coordination
- **Resources:** GitHub Actions cache quota, registry storage for cached BuildKit layers, staging environment for validation.
- **Dependencies:** Completion of the multi-stage Docker rework (Recommendation E), collaboration with DevOps for workflow changes, QA availability to verify no runtime regressions.
- **Stakeholders:** DevOps engineers (workflow updates), backend developers (Dockerfile review), QA team (smoke testing), release managers (monitor pipeline improvements).

## 5. Timeline and Prioritization Notes
- Estimated effort: 1.5–2 engineering days following Recommendation E.
  1. Half-day for baseline metrics and Docker stage adjustments.
  2. One day for GitHub Actions cache wiring, validations, and documentation.
  3. Buffer for iterative tweaks after observing real pipeline behavior.
- Schedule immediately after Recommendation E to capitalize on the new stage boundaries.

## 6. Potential Risks and Mitigation Strategies
- **Cache poisoning:** Stale or corrupted cache entries might cause inconsistent installs; include periodic cache bust controls (manual `workflow_dispatch` input) and automated checksum verification.
- **Runner environment drift:** Native module compilation results could differ across runner versions; pin Node.js version via `actions/setup-node` and leverage prebuilt binaries when possible.
- **Increased cache storage usage:** Monitor GitHub Actions storage quotas; prune unused caches using scheduled maintenance workflows if necessary.

## 7. Testing and Validation Strategy
- **Functional tests:** Execute `yarn test` (or smoke scripts) inside the cached environment to assure dependency integrity.
- **Performance validation:** Compare cached vs. uncached install times across consecutive workflow runs and share metrics with stakeholders.
- **Docker verification:** Build images twice locally/CI with BuildKit to confirm the dependency layer hits cache and runtime images remain unchanged.
- **Monitoring:** Track GitHub Actions cache hit ratios and error logs for the first two weeks, adjusting keys or fallback logic as needed.