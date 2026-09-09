import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    DOWNLOAD_METADATA_UNKNOWN_GUILD_ID,
    downloadMetadataStoreKey,
} from "./downloadMetadataKeys.js"
import {
    deleteConditionsForStoreKeys,
    normalizedRowsFromStore,
    toDownloadMetadataEntry,
} from "./downloadMetadataNormalize.js"

describe("normalizedRowsFromStore", () => {
    it("skips UNKNOWN and unresolvable guild ids into skippedEntries", () => {
        const unknownKey = downloadMetadataStoreKey(DOWNLOAD_METADATA_UNKNOWN_GUILD_ID, "a.wav")
        const store = {
            [unknownKey]: { guildId: DOWNLOAD_METADATA_UNKNOWN_GUILD_ID },
            "orphan.wav": { originalUrl: "https://x" },
            "legacy.wav": { guildId: "guild-ok" },
        }
        const { rows, skippedEntries } = normalizedRowsFromStore(store)
        assert.equal(rows.length, 1)
        assert.equal(rows[0]?.guildId, "guild-ok")
        assert.equal(rows[0]?.fileName, "legacy.wav")
        assert.deepEqual(skippedEntries.map((e) => e.key).sort(), [unknownKey, "orphan.wav"].sort())
        assert.ok(skippedEntries.every((e) => e.reason === "unresolvable-guild-id"))
    })

    it("prefers composite store keys over legacy filename-only for the same guild+file", () => {
        const guildId = "guild-1"
        const fileName = "track.wav"
        const composite = downloadMetadataStoreKey(guildId, fileName)
        const store = {
            [fileName]: {
                guildId,
                originalUrl: "https://legacy",
                filePath: "/tmp/legacy.wav",
            },
            [composite]: {
                guildId,
                originalUrl: "https://composite",
                filePath: "/tmp/composite.wav",
            },
        }
        const { rows, skippedEntries } = normalizedRowsFromStore(store)
        assert.equal(skippedEntries.length, 0)
        assert.equal(rows.length, 1)
        assert.equal(rows[0]?.originalUrl, "https://composite")
        assert.equal(rows[0]?.filePath, "/tmp/composite.wav")
        assert.equal(rows[0]?.guildId, guildId)
        assert.equal(rows[0]?.fileName, fileName)
    })

    it("keeps distinct guilds with the same fileName as separate rows", () => {
        const a = downloadMetadataStoreKey("guild-a", "same.wav")
        const b = downloadMetadataStoreKey("guild-b", "same.wav")
        const { rows } = normalizedRowsFromStore({
            [a]: { guildId: "guild-a", originalUrl: "https://a" },
            [b]: { guildId: "guild-b", originalUrl: "https://b" },
        })
        assert.equal(rows.length, 2)
        const byGuild = new Map(rows.map((r) => [r.guildId, r.originalUrl]))
        assert.equal(byGuild.get("guild-a"), "https://a")
        assert.equal(byGuild.get("guild-b"), "https://b")
    })

    it("drops invalid downloadDate values to null", () => {
        const key = downloadMetadataStoreKey("guild-1", "t.wav")
        const { rows } = normalizedRowsFromStore({
            [key]: { guildId: "guild-1", downloadDate: "not-a-date" },
        })
        assert.equal(rows.length, 1)
        assert.equal(rows[0]?.downloadDate, null)
    })
})

describe("deleteConditionsForStoreKeys", () => {
    it("emits composite guild+file conditions and dedupes repeats", () => {
        const key = downloadMetadataStoreKey("guild-1", "a.wav")
        const conditions = deleteConditionsForStoreKeys([key, key, "  "])
        assert.deepEqual(conditions, [{ guildId: "guild-1", fileName: "a.wav" }])
    })

    it("skips filename-only keys so deletes cannot wipe every guild for that file", () => {
        const composite = downloadMetadataStoreKey("guild-1", "shared.wav")
        const conditions = deleteConditionsForStoreKeys(["shared.wav", composite])
        assert.deepEqual(conditions, [{ guildId: "guild-1", fileName: "shared.wav" }])
        assert.equal(
            conditions.some((c) => !("guildId" in c) || c.guildId === undefined),
            false
        )
    })

    it("returns no conditions when only filename-only keys are provided", () => {
        assert.deepEqual(deleteConditionsForStoreKeys(["a.wav", "b.wav", ""]), [])
    })
})

describe("toDownloadMetadataEntry", () => {
    it("serializes finite Date and ISO string downloadDate values", () => {
        const iso = "2026-08-01T12:00:00.000Z"
        assert.deepEqual(
            toDownloadMetadataEntry({
                guildId: "guild-1",
                downloadDate: new Date(iso),
                originalUrl: "https://example.com/a",
                filePath: "/tmp/a.wav",
            }),
            {
                guildId: "guild-1",
                downloadDate: iso,
                originalUrl: "https://example.com/a",
                filePath: "/tmp/a.wav",
            }
        )
        assert.equal(
            toDownloadMetadataEntry({
                guildId: "guild-1",
                downloadDate: iso,
                originalUrl: null,
                filePath: null,
            }).downloadDate,
            iso
        )
    })

    it("omits invalid downloadDate instead of emitting Invalid Date", () => {
        assert.deepEqual(
            toDownloadMetadataEntry({
                guildId: "guild-1",
                downloadDate: "not-a-date",
                originalUrl: null,
                filePath: null,
            }),
            { guildId: "guild-1" }
        )
        assert.deepEqual(
            toDownloadMetadataEntry({
                guildId: "guild-1",
                downloadDate: new Date("nope"),
                originalUrl: "https://x",
                filePath: null,
            }),
            { guildId: "guild-1", originalUrl: "https://x" }
        )
    })
})
