/**
 * Runs Dashboard tests with the web tsconfig and Node's module-mock flag.
 * `tsx --test` spawns a child Node process. The flag is not allowed in
 * NODE_OPTIONS, so it is forwarded as a child Node argument.
 *
 * Dashboard packages such as `next` live in `src/web/node_modules`. Tests under
 * `tests/web/` resolve bare specifiers from their own directory upward, so a
 * link there lets `mock.module("next/headers")` find the Dashboard install.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dirname, "..")
const webNodeModules = path.join(root, "src/web/node_modules")
const testsNodeModules = path.join(root, "tests/web/node_modules")
if (!fs.existsSync(testsNodeModules) && fs.existsSync(webNodeModules)) {
    fs.symlinkSync(
        webNodeModules,
        testsNodeModules,
        process.platform === "win32" ? "junction" : "dir"
    )
}
const result = spawnSync(
    process.execPath,
    [
        path.join(root, "node_modules/tsx/dist/cli.mjs"),
        "--tsconfig",
        path.join(root, "src/web/tsconfig.json"),
        "--experimental-test-module-mocks",
        "--test",
        "tests/web/**/*.test.ts",
    ],
    {
        cwd: root,
        stdio: "inherit",
        env: process.env,
    }
)
process.exit(result.status ?? 1)
