# Entry-point tests run before every commit

The Bot and Dashboard already had a `yarn test` suite, but nothing ran it before a commit or in CI, so a red suite could ship. Tests live under `tests/`, mirroring the source tree, so production files are not siblings of `*.test.ts`. We run `yarn test` from a Husky pre-commit hook and from the CI validate job (including pull requests, without building or pushing images). Slash commands, Discord and Lavalink events, Bot API handlers, and Dashboard actions are tested by calling the real function with hand-rolled fakes. We do not extract new pure functions just to test them, and we do not re-assert helpers that already have tests. A new outcome ships with a test. A changed feature, bug fix, or security fix updates the assertion that would have failed on the old behavior. A refactor that does not change a reply, status, or security decision does not require a test edit.

**Considered options**

- CI only, no git hook — rejected; a commit on a machine that never opens a pull request would not run the suite.
- Extract each command's decisions into a pure function and leave `execute` untested — rejected; the untested replies live in `execute`, and the existing helper tests already cover the delegated logic.
- Require a test-file edit on every production change, including refactors — rejected; a refactor with the same replies does not need a new assertion.
