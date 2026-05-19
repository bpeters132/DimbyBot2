import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.join(import.meta.dirname, "..")
const schemaPath = path.join(repoRoot, "prisma", "schema.prisma")

/** Skip when schema is not present (e.g. Docker layer-cache `yarn install` before `COPY . .`). */
if (!fs.existsSync(schemaPath)) {
    process.exit(0)
}

const prismaCli = path.join(repoRoot, "node_modules", "prisma", "build", "index.js")
const result = spawnSync(process.execPath, [prismaCli, "generate"], {
    cwd: repoRoot,
    stdio: "inherit",
})

process.exit(result.status ?? 1)
