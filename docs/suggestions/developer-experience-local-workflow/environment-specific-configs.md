# Implementation Plan: Add Environment-Specific Configuration Files

## 1. Summary of the Recommendation
- Introduce explicit configuration resolution for local development and production so the bot always loads correct secrets, feature toggles, and service endpoints without manual edits.
- Standardize configuration artifacts (dotenv layers, JSON overrides) plus loading order to minimize accidental leakage of production settings into local environments and vice versa.

## 2. Goals and Success Metrics
- Configuration loader selects the correct environment profile with zero manual file edits in ≥95% of launches, validated by startup assertions in application logs.
- Continuous delivery pipelines fail fast if required production settings are absent, preventing configuration-related rollbacks.
- Onboarding tasks reduce to <10 minutes for new developers by providing automated scripts that generate local templates and verification checks.

## 3. Technical Approach with Ordered Implementation Tasks
1. **Config Inventory and Requirement Mapping**
   - Catalogue all current configuration touchpoints: [`README.md`](README.md), [`dev-env.sh`](dev-env.sh), [`docker-compose.yml`](docker-compose.yml), [`docker-compose.dev.yml`](docker-compose.dev.yml), [`Dockerfile.dev`](Dockerfile.dev), and [`docs/suggestions/development-database-setup.md`](docs/suggestions/development-database-setup.md).
   - Classify variables/secrets by sensitivity and environment scope (local-only vs. production-required).
2. **Define File and Loader Structure**
   - Create a dedicated configuration module at [`src/config/environment.js`](src/config/environment.js) that loads layered dotenv files and merges JSON overrides.
   - Establish naming conventions: `.env.shared` (checked in defaults), `.env.local` (developer overrides, gitignored), `.env.production` (CI reference), and `config/production.json` for non-secret operational flags.
   - Adopt `dotenv-flow` or an equivalent package to simplify layered resolution; document rationale in the new configuration module.
3. **Automate Local Environment Bootstrapping**
   - Extend [`dev-env.sh`](dev-env.sh) with targets such as `./dev-env.sh env:init` that copy `.env.shared` to `.env.local` and prompt for required secrets.
   - Update Make targets (e.g., `make env-check`) to call a validation script under [`scripts/verify-env.mjs`](scripts/verify-env.mjs) that confirms required keys for local development.
4. **Integrate with Application Runtime**
   - Refactor all runtime configuration reads to import from [`src/config/environment.js`](src/config/environment.js) instead of `process.env` directly (e.g., [`src/lib/LavalinkManager.js`](src/lib/LavalinkManager.js), [`src/commands/developer/DeployCommands.js`](src/commands/developer/DeployCommands.js)).
   - Emit structured logging on startup highlighting the active environment profile (redacting secrets) to aid observability.
5. **Production Pipeline Alignment**
   - Update deployment assets: inject `ENV_PROFILE=production` into [`docker-compose.yml`](docker-compose.yml) and `.env` provisioning steps inside [`dev-env.sh`](dev-env.sh) and [`Makefile`](Makefile).
   - Modify CI workflows (e.g., [`workflows/deploy.yml`](.github/workflows/deploy.yml)) to pull `.env.production` values from secret storage and run the validation script before build steps.
6. **Documentation and Governance**
   - Expand the configuration section in [`README.md`](README.md) with a matrix comparing local vs. production keys, storage location, and rotation owners.
   - Add onboarding checklist items in `docs/` referencing new scripts and validation procedures; ensure cross-links from related plans (testing, database seeding).

## 4. Required Resources, Dependencies, and Stakeholder Coordination
- **Resources:** Node.js configuration library (`dotenv-flow` or similar), script runner support, documentation updates, developer onboarding time.
- **Dependencies:** Ability to update CI secrets store, cooperation with database setup plan for shared credentials, alignment with deployment automation referenced in [`docs/suggestions/cicd-code-quality-checks.md`](docs/suggestions/cicd-code-quality-checks.md).
- **Stakeholders:** Backend developers (configuration consumers), DevOps/Infrastructure (CI/CD secret management), Security/Compliance (secret handling review), Documentation maintainers (knowledge base updates).

## 5. Timeline or Prioritization Notes
- Estimated total effort: ~2 engineering days plus coordination.
  1. Day 1 morning: inventory, loader design, select tooling.
  2. Day 1 afternoon: implement loader, update runtime imports, create validation script.
  3. Day 2 morning: integrate with local tooling, update CI pipeline, write documentation.
  4. Day 2 afternoon: peer review, dry runs, and approvals.
- Schedule after debugging support setup to avoid conflicting changes in `dev-env.sh`, and before database seeding to provide stable config primitives for credentials.

## 6. Potential Risks and Mitigation Strategies
- **Secret Leakage via Git:** Enforce `.gitignore` rules for local overrides and add pre-commit checks to block `.env.local` commits.
- **Configuration Drift Between Environments:** Automate validation in CI and add a nightly job that compares `.env.production` template against secret store inventory.
- **Developer Friction from Added Scripts:** Provide clear documentation, default prompts, and fallback to manual `.env` editing for emergencies.
- **Runtime Failures Because of Early Refactors:** Introduce feature flag for new loader (`CONFIG_LAYERING_ENABLED`) to allow staged rollout and quick rollback.

## 7. Testing and Validation Strategy
- **Unit Tests:** Add coverage for [`src/config/environment.js`](src/config/environment.js) to verify precedence rules, default values, and error handling.
- **Script Verification:** Run `./dev-env.sh env:init` and `make env-check` during CI to confirm automation works across Linux/macOS shells.
- **Integration Tests:** Smoke-test bot startup locally and in production staging containers, asserting environment profile logs and absence of missing-variable warnings.
- **Documentation Validation:** Have two developers follow the refreshed onboarding guide, capturing feedback in the configuration plan issue for continuous improvement.