import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, describe, it } from "node:test"
import {
    guildDownloadFilePrefix,
    isResolvedPathInsideDir,
    listAgedUntrackedGuildDownloadFiles,
    listDownloadFilesWithPrefix,
    removeDownloadFilesWithPrefix,
} from "./downloadArtifacts.js"

const tempDirs: string[] = []

function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dimby-dl-artifacts-"))
    tempDirs.push(dir)
    return dir
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()
        if (!dir) continue
        fs.rmSync(dir, { recursive: true, force: true })
    }
})

describe("downloadArtifacts", () => {
    it("builds the guild filename prefix", () => {
        assert.equal(guildDownloadFilePrefix("123"), "123_")
    })

    it("rejects path traversal outside the downloads dir", () => {
        const dir = makeTempDir()
        assert.equal(isResolvedPathInsideDir(dir, path.join(dir, "ok.wav")), true)
        assert.equal(isResolvedPathInsideDir(dir, path.join(dir, "..", "escape.wav")), false)
        assert.equal(isResolvedPathInsideDir(dir, dir), false)
    })

    it("lists and removes only files for the given prefix", () => {
        const dir = makeTempDir()
        fs.writeFileSync(path.join(dir, "guildA_run1_a.wav"), "aaaa")
        fs.writeFileSync(path.join(dir, "guildA_run1_b.part"), "bb")
        fs.writeFileSync(path.join(dir, "guildA_run2_c.wav"), "ccc")
        fs.writeFileSync(path.join(dir, "guildB_run1_d.wav"), "dddd")

        const listed = listDownloadFilesWithPrefix(dir, "guildA_run1_")
        assert.equal(listed.length, 2)

        const removed = removeDownloadFilesWithPrefix(dir, "guildA_run1_")
        assert.equal(removed.deletedCount, 2)
        assert.equal(removed.deletedSize, 6)
        assert.equal(fs.existsSync(path.join(dir, "guildA_run2_c.wav")), true)
        assert.equal(fs.existsSync(path.join(dir, "guildB_run1_d.wav")), true)
        assert.equal(fs.existsSync(path.join(dir, "guildA_run1_a.wav")), false)
    })

    it("lists only aged untracked guild files", () => {
        const dir = makeTempDir()
        const guildId = "999"
        const oldPath = path.join(dir, `${guildId}_old.wav`)
        const freshPath = path.join(dir, `${guildId}_fresh.wav`)
        const trackedPath = path.join(dir, `${guildId}_tracked.wav`)
        fs.writeFileSync(oldPath, "old")
        fs.writeFileSync(freshPath, "fresh")
        fs.writeFileSync(trackedPath, "tracked")

        const now = Date.now()
        fs.utimesSync(oldPath, new Date(now - 60_000), new Date(now - 60_000))
        fs.utimesSync(freshPath, new Date(now - 1_000), new Date(now - 1_000))
        fs.utimesSync(trackedPath, new Date(now - 60_000), new Date(now - 60_000))

        const aged = listAgedUntrackedGuildDownloadFiles(
            dir,
            guildId,
            new Set([`${guildId}_tracked.wav`]),
            30_000,
            now
        )
        assert.deepEqual(
            aged.map((f) => f.name).sort(),
            [`${guildId}_old.wav`]
        )
    })
})
