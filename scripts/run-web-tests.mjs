/**
 * Runs Dashboard tests with the web tsconfig and Node's module-mock flag.
 * `tsx --test` spawns a child Node process. The flag is not allowed in
 * NODE_OPTIONS, so it is forwarded as a child Node argument.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"

const root = path.join(import.meta.dirname, "..")
const result = spawnSync(
    process.execPath,
    [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        "--tsconfig",
        path.join(root, "src/web/tsconfig.json"),
        "--experimental-test-module-mocks",
        "--test",
        "src/web/**/*.test.ts",
    ],
    {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    }
)
process.exit(result.status ?? 1)
