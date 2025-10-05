# Cache Troubleshooting Guide

This guide covers common issues with dependency caching in the DimbyBot2 CI/CD pipeline and how to resolve them.

## Yarn Cache Issues

### Cache Corruption or Stale Entries

**Symptoms:**
- `yarn install --immutable` fails with integrity errors
- Unexpected dependency versions in builds
- Cache hit but build still slow

**Resolution:**
1. Trigger workflow dispatch with `invalidate_caches: true`
2. This skips yarn cache restoration and forces fresh install
3. Alternatively, delete yarn cache manually in GitHub Actions UI

### Lockfile Mismatch

**Symptoms:**
- `yarn install --immutable` fails with "Lockfile does not satisfy .package.json" error
- Dependencies out of sync between package.json and yarn.lock

**Resolution:**
1. Locally run `yarn install` to update yarn.lock
2. Commit the updated yarn.lock
3. If issue persists, run `yarn install --mode update-lockfile` and commit changes

## BuildKit Cache Issues

### Cache Scope Conflicts

**Symptoms:**
- Bot and Lavalink builds interfere with each other's caches
- Unexpected cache misses for unchanged dependencies

**Resolution:**
- Caches are scoped separately by default: `dimbybot2-bot` and `dimbybot2-lavalink`
- For branch-scoped caching: `{branch-name}-bot` and `{branch-name}-lavalink`
- For environment-scoped caching: `{environment-name}-bot` and `{environment-name}-lavalink`
- If cross-contamination suspected, invalidate caches or switch to different scope mode

### Selecting Cache Scopes

**Shared Scope (Default):**
- Use `cache_scope_mode: shared` in workflow dispatch
- All builds share the same cache regardless of branch/environment
- Best for: Small teams, simple deployments

**Branch Scope:**
- Use `cache_scope_mode: branch`
- Cache isolated per branch (e.g., `master-bot`, `feature-x-bot`)
- Best for: Feature branches, avoiding cache pollution between branches

**Environment Scope:**
- Use `cache_scope_mode: environment`
- Requires `deploy_environment` input (e.g., `production`, `staging`)
- Cache isolated per environment
- Best for: Multi-environment deployments, production/staging separation

### Disabling Docker Caching

**Symptoms:**
- Need to force fresh Docker builds without cache
- Debugging cache-related build issues

**Resolution:**
1. Trigger workflow dispatch with `enable_docker_cache: false`
2. This disables GHA cache but still uses registry inline caching
3. For complete cache bypass, also set `invalidate_caches: true`

### Registry Fallback Caching

When GHA cache is disabled or invalidated, builds automatically fall back to registry inline caching:

- Pulls the latest image tag from GitHub Container Registry
- Uses `cache-from: type=registry,ref=<image-tag>`
- Still provides layer reuse without GHA cache storage
- Useful when GHA cache is unavailable or for cold starts

### BuildKit Cache Not Working

**Symptoms:**
- Docker builds not using cache despite unchanged layers
- Build times not improving

**Resolution:**
1. Check BuildKit is enabled (configured via `docker/setup-buildx-action`)
2. Ensure `BUILDKIT_INLINE_CACHE=1` build arg is set
3. Verify cache-from/cache-to configuration in workflow
4. Check workflow summary for cache hit/miss telemetry
5. Try disabling GHA cache to test registry fallback

## GitHub Actions Cache Management

### Deleting Caches via UI

1. Go to your repository on GitHub
2. Navigate to **Actions** tab
3. Click on a recent workflow run
4. In the run summary, scroll to **Artifacts** section
5. Click the **View all artifacts** link (if present)
6. Look for cache entries (may not be directly visible)
7. Alternatively, go to repository **Settings > Actions > Caches**
8. Delete specific cache entries by scope or key

### Cache Key Format

- Yarn cache: `Linux-yarn-${{ hashFiles('yarn.lock') }}`
- BuildKit bot: `{scope}-bot` where scope depends on `cache_scope_mode`
  - Shared: `dimbybot2-bot`
  - Branch: `{branch-name}-bot`
  - Environment: `{environment-name}-bot`
- BuildKit Lavalink: `{scope}-lavalink` (same pattern as bot)

## Local Development Cache Flushing

### Docker Cache Issues

**Symptoms:**
- Local `docker-compose.dev.yml` builds failing
- Bind mounts not working with cached layers

**Resolution:**
1. Stop containers: `docker-compose -f docker-compose.dev.yml down`
2. Clean Docker cache: `docker system prune -a`
3. Rebuild: `./dev-env.sh build`

### Yarn Cache Local Flush

1. Delete local yarn cache: `yarn cache clean`
2. Clear node_modules: `rm -rf node_modules`
3. Reinstall: `yarn install`

## Monitoring Cache Performance

- Check workflow run summaries for cache hit/miss status
- Monitor build times in GitHub Actions logs
- Use `docker buildx build --progress=plain` locally to see layer caching

## Preventive Measures

- Always commit yarn.lock changes with package.json updates
- Use `yarn install --immutable` in CI to catch lockfile drift early
- Regularly review cache storage usage in repository settings
- Test cache invalidation workflows periodically