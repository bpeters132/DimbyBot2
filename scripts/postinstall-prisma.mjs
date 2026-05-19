import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.join(import.meta.dirname, "..")
const schemaPath = path.join(repoRoot, "prisma", "schema.prisma")

/** Skip when schema is not present (e.g. Docker layer-cache `yarn install` before `COPY . .`). */
if (!fs.existsSync(schemaPath)) {
    process.exit(0)
}

const prismaBin = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
)
if (!fs.existsSync(prismaBin)) {
    console.error("[postinstall-prisma] Prisma CLI not found; install root dependencies first.")
    process.exit(1)
}

const result = spawnSync(prismaBin, ["generate"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
})

process.exit(result.status ?? 1)
