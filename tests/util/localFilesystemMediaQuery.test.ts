import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { guildDownloadFilePrefix } from "../../src/util/downloadArtifacts.js"
import {
    isBlockedLocalFilesystemMediaQuery,
    isPermittedGuildDownloadPlaybackPath,
    looksLikeLocalFilesystemMediaQuery,
    USER_LOCAL_FILE_QUERY_BLOCKED,
} from "../../src/util/localFilesystemMediaQuery.js"

describe("looksLikeLocalFilesystemMediaQuery", () => {
    it("flags absolute, relative, file:, local:, and downloads/ paths", () => {
        assert.equal(looksLikeLocalFilesystemMediaQuery("/app/downloads/g_x_song.wav"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("local:/etc/passwd"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("LOCAL:/app/downloads/a.wav"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("file:///etc/passwd"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("../.env"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("./downloads/x.wav"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("downloads/other_guild_song.wav"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("C:\\secrets\\token.txt"), true)
        assert.equal(looksLikeLocalFilesystemMediaQuery("~/secret.wav"), true)
        assert.equal(
            looksLikeLocalFilesystemMediaQuery("link:/app/downloads/other_guild_song.wav"),
            true
        )
        assert.equal(
            looksLikeLocalFilesystemMediaQuery("uri:/app/downloads/other_guild_song.wav"),
            true
        )
    })

    it("allows normal song titles and catalog URLs", () => {
        assert.equal(looksLikeLocalFilesystemMediaQuery("never gonna give you up"), false)
        assert.equal(looksLikeLocalFilesystemMediaQuery("AC/DC - Back In Black"), false)
        assert.equal(
            looksLikeLocalFilesystemMediaQuery("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            false
        )
        assert.equal(looksLikeLocalFilesystemMediaQuery("ytsearch:rick astley"), false)
    })
})

describe("isPermittedGuildDownloadPlaybackPath / isBlockedLocalFilesystemMediaQuery", () => {
    it("permits only this guild's WAV under downloadsDir", () => {
        const downloadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dimby-dl-"))
        try {
            const guildId = "111222333444555666"
            const otherGuild = "999888777666555444"
            const ownName = `${guildDownloadFilePrefix(guildId)}abcd1234efgh5678_Song Title.wav`
            const otherName = `${guildDownloadFilePrefix(otherGuild)}abcd1234efgh5678_Song Title.wav`
            const ownPath = path.join(downloadsDir, ownName)
            const otherPath = path.join(downloadsDir, otherName)
            fs.writeFileSync(ownPath, "x")
            fs.writeFileSync(otherPath, "x")

            assert.equal(
                isPermittedGuildDownloadPlaybackPath(guildId, ownPath, { downloadsDir }),
                true
            )
            assert.equal(
                isBlockedLocalFilesystemMediaQuery(ownPath, { guildId, downloadsDir }),
                false
            )
            assert.equal(
                isPermittedGuildDownloadPlaybackPath(guildId, otherPath, { downloadsDir }),
                false
            )
            assert.equal(
                isBlockedLocalFilesystemMediaQuery(otherPath, { guildId, downloadsDir }),
                true
            )
            assert.equal(
                isBlockedLocalFilesystemMediaQuery(`/etc/passwd`, { guildId, downloadsDir }),
                true
            )
            assert.equal(
                isBlockedLocalFilesystemMediaQuery(`local:${otherPath}`, {
                    guildId,
                    downloadsDir,
                }),
                true
            )
            assert.equal(
                isBlockedLocalFilesystemMediaQuery(`link:${otherPath}`, {
                    guildId,
                    downloadsDir,
                }),
                true
            )
            assert.equal(
                isBlockedLocalFilesystemMediaQuery(`uri:${otherPath}`, {
                    guildId,
                    downloadsDir,
                }),
                true
            )
            // Without guildId (playlist save), every path is blocked.
            assert.equal(isBlockedLocalFilesystemMediaQuery(ownPath), true)
            assert.equal(typeof USER_LOCAL_FILE_QUERY_BLOCKED, "string")
        } finally {
            fs.rmSync(downloadsDir, { recursive: true, force: true })
        }
    })

    it("rejects relative downloads/ forms even when guildId is set", () => {
        assert.equal(
            isBlockedLocalFilesystemMediaQuery("downloads/111_abc_song.wav", {
                guildId: "111222333444555666",
            }),
            true
        )
    })
})
