/**
 * Installs Husky's git hooks when this checkout has a `.git` directory.
 * Image builds copy `package.json` before the repo and exclude `.git`, so a missing
 * git dir or a production install without the Husky binary must not fail `yarn install`.
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"

if (!existsSync(".git")) {
    process.exit(0)
}

const require = createRequire(import.meta.url)
let huskyBin
try {
    huskyBin = require.resolve("husky/bin.js")
} catch {
    process.exit(0)
}

const result = spawnSync(process.execPath, [huskyBin], { stdio: "inherit" })
process.exit(result.status ?? 1)
