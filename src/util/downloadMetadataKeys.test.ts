import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    DOWNLOAD_METADATA_KEY_SEP,
    DOWNLOAD_METADATA_UNKNOWN_GUILD_ID,
    dedupeMetadataByFileName,
    downloadMetadataEntryMatchesGuild,
    downloadMetadataFileBelongsToGuild,
    downloadMetadataKeysForFile,
    downloadMetadataStoreKey,
    effectiveDownloadMetadataGuildId,
    parseDownloadMetadataStoreKey,
    parseValidDownloadDate,
} from "./downloadMetadataKeys.js"

describe("downloadMetadataStoreKey / parseDownloadMetadataStoreKey", () => {
    it("round-trips composite guild+file keys", () => {
        const key = downloadMetadataStoreKey("guild-a", "track.wav")
        assert.equal(key, `guild-a${DOWNLOAD_METADATA_KEY_SEP}track.wav`)
        assert.deepEqual(parseDownloadMetadataStoreKey(key), {
            guildId: "guild-a",
            fileName: "track.wav",
        })
    })

    it("treats legacy plain file names as guild-less keys", () => {
        assert.deepEqual(parseDownloadMetadataStoreKey("legacy.wav"), {
            guildId: null,
            fileName: "legacy.wav",
        })
    })
})

describe("effectiveDownloadMetadataGuildId", () => {
    it("prefers composite key guild id and ignores UNKNOWN sentinel", () => {
        const composite = downloadMetadataStoreKey("guild-a", "a.wav")
        assert.equal(effectiveDownloadMetadataGuildId(composite, { guildId: "other" }), "guild-a")
        assert.equal(
            effectiveDownloadMetadataGuildId(
                downloadMetadataStoreKey(DOWNLOAD_METADATA_UNKNOWN_GUILD_ID, "a.wav"),
                undefined
            ),
            null
        )
        assert.equal(
            effectiveDownloadMetadataGuildId("legacy.wav", {
                guildId: DOWNLOAD_METADATA_UNKNOWN_GUILD_ID,
            }),
            null
        )
        assert.equal(
            effectiveDownloadMetadataGuildId("legacy.wav", { guildId: " guild-b " }),
            "guild-b"
        )
    })
})

describe("downloadMetadataFileBelongsToGuild / entryMatchesGuild / keysForFile", () => {
    it("matches composite keys strictly and legacy keys by guildId rules", () => {
        const guildId = "guild-1"
        const fileName = "song.wav"
        const composite = downloadMetadataStoreKey(guildId, fileName)
        const metadata = {
            [composite]: { guildId },
            "other.wav": { guildId: "guild-2" },
            "orphan.wav": { guildId: "" },
        }

        assert.equal(downloadMetadataFileBelongsToGuild(metadata, fileName, guildId), true)
        assert.equal(downloadMetadataFileBelongsToGuild(metadata, "other.wav", guildId), false)
        assert.equal(downloadMetadataFileBelongsToGuild(metadata, "orphan.wav", guildId), true)
        assert.equal(downloadMetadataFileBelongsToGuild(metadata, "missing.wav", guildId), false)

        assert.equal(
            downloadMetadataEntryMatchesGuild(composite, metadata[composite], guildId),
            true
        )
        assert.equal(
            downloadMetadataEntryMatchesGuild("other.wav", metadata["other.wav"], guildId),
            false
        )
        assert.equal(
            downloadMetadataEntryMatchesGuild("orphan.wav", metadata["orphan.wav"], guildId),
            true
        )
    })

    it("collects composite and matching legacy keys for cleanup", () => {
        const guildId = "guild-1"
        const fileName = "song.wav"
        const composite = downloadMetadataStoreKey(guildId, fileName)
        const metadata = {
            [composite]: { guildId },
            [fileName]: { guildId },
            "song.wav-other": { guildId: "guild-2" },
        }
        assert.deepEqual(downloadMetadataKeysForFile(metadata, fileName, guildId), [
            composite,
            fileName,
        ])
        assert.deepEqual(
            downloadMetadataKeysForFile({ [fileName]: { guildId: "x" } }, fileName, guildId),
            []
        )
    })
})

describe("parseValidDownloadDate", () => {
    it("accepts finite string and number timestamps", () => {
        const iso = parseValidDownloadDate("2026-07-01T12:00:00.000Z")
        assert.ok(iso)
        assert.equal(iso.toISOString(), "2026-07-01T12:00:00.000Z")
        const ms = parseValidDownloadDate(1_720_000_000_000)
        assert.ok(ms)
        assert.equal(ms.getTime(), 1_720_000_000_000)
    })

    it("rejects invalid types and Invalid Date", () => {
        assert.equal(parseValidDownloadDate(undefined), null)
        assert.equal(parseValidDownloadDate(null), null)
        assert.equal(parseValidDownloadDate({}), null)
        assert.equal(parseValidDownloadDate("not-a-date"), null)
        assert.equal(parseValidDownloadDate(Number.NaN), null)
    })
})

describe("dedupeMetadataByFileName", () => {
    it("keeps the newest entry when composite and legacy keys collide", () => {
        const guildId = "guild-1"
        const fileName = "track.wav"
        const composite = downloadMetadataStoreKey(guildId, fileName)
        const older = Date.parse("2026-01-01T00:00:00.000Z")
        const newer = Date.parse("2026-06-01T00:00:00.000Z")
        const deduped = dedupeMetadataByFileName(
            {
                [composite]: { guildId, downloadDate: older },
                [fileName]: { guildId, downloadDate: newer },
                [downloadMetadataStoreKey("guild-2", fileName)]: {
                    guildId: "guild-2",
                    downloadDate: newer + 1,
                },
            },
            guildId
        )
        assert.equal(deduped.size, 1)
        const row = deduped.get(fileName)
        assert.ok(row)
        assert.equal(row.key, fileName)
        assert.equal(row.info.downloadDate, newer)
    })

    it("treats missing downloadDate as epoch so dated rows win", () => {
        const guildId = "guild-1"
        const fileName = "undated.wav"
        const composite = downloadMetadataStoreKey(guildId, fileName)
        const deduped = dedupeMetadataByFileName(
            {
                [fileName]: { guildId },
                [composite]: { guildId, downloadDate: "2026-03-01T00:00:00.000Z" },
            },
            guildId
        )
        assert.equal(deduped.get(fileName)?.key, composite)
    })
})
