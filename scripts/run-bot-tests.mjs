/**
 * Runs Bot `*.test.ts` files under `src/`, excluding the Dashboard (`src/web/`).
 * Avoids a giant argv list so Windows command-line limits do not clip the suite.
 */
import { glob } from "node:fs/promises"
import path from "node:path"
import { finished } from "node:stream/promises"
import { run } from "node:test"
import { spec } from "node:test/reporters"

const root = path.join(import.meta.dirname, "..")
const files = []

for await (const file of glob("src/**/*.test.ts", { cwd: root })) {
    const normalized = file.replaceAll("\\", "/")
    if (normalized.startsWith("src/web/")) {
        continue
    }
    files.push(path.resolve(root, file))
}

if (files.length === 0) {
    console.error("No bot tests found under src/ (excluding src/web/).")
    process.exit(1)
}

const stream = run({ files })
stream.on("test:fail", () => {
    process.exitCode = 1
})
stream.compose(spec).pipe(process.stdout)
await finished(stream)
process.exit(process.exitCode ?? 0)
