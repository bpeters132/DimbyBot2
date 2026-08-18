import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { downloadMetadataStoreKey } from "./downloadMetadataKeys.js"
import {
    collectValidDownloadMetadataEntries,
    collectValidGuildSettingsEntries,
    isDownloadMetadataEntryShape,
    isGuildSettingsStoreShape,
} from "./jsonMigrationValidate.js"

describe("isGuildSettingsStoreShape", () => {
    it("accepts an empty object and guild id → settings object maps", () => {
        assert.equal(isGuildSettingsStoreShape({}), true)
        assert.equal(
            isGuildSettingsStoreShape({
                "123": { controlChannelId: "456", downloadsMaxMb: 100 },
                "789": {},
            }),
            true
        )
    })

    it("rejects null, arrays, and non-object entry values", () => {
        assert.equal(isGuildSettingsStoreShape(null), false)
        assert.equal(isGuildSettingsStoreShape([]), false)
        assert.equal(isGuildSettingsStoreShape("nope"), false)
        assert.equal(isGuildSettingsStoreShape({ g1: null }), false)
        assert.equal(isGuildSettingsStoreShape({ g1: [] }), false)
        assert.equal(isGuildSettingsStoreShape({ g1: "settings" }), false)
        assert.equal(isGuildSettingsStoreShape({ g1: 1 }), false)
    })

    it("rejects mistyped known GuildSettings fields including nested discordLog", () => {
        assert.equal(isGuildSettingsStoreShape({ g1: { downloadsMaxMb: "100" } }), false)
        assert.equal(isGuildSettingsStoreShape({ g1: { controlChannelId: 12 } }), false)
        assert.equal(isGuildSettingsStoreShape({ g1: { discordLog: { allChannelId: 99 } } }), false)
        assert.equal(
            isGuildSettingsStoreShape({ g1: { discordLog: { minLevel: "trace" } } }),
            false
        )
        assert.equal(
            isGuildSettingsStoreShape({
                g1: { discordLog: { allChannelId: "c1", minLevel: "info" } },
            }),
            true
        )
        assert.equal(
            isGuildSettingsStoreShape({
                g1: { downloadsMaxMb: 100, extraLegacyKey: "keep-for-forward-compat" },
            }),
            true
        )
    })
})

describe("isDownloadMetadataEntryShape", () => {
    it("accepts empty objects and optional fields with correct types", () => {
        assert.equal(isDownloadMetadataEntryShape({}), true)
        assert.equal(
            isDownloadMetadataEntryShape({
                guildId: "guild-1",
                downloadDate: "2026-01-01T00:00:00.000Z",
                originalUrl: "https://example.com/a",
                filePath: "/tmp/a.wav",
            }),
            true
        )
        assert.equal(isDownloadMetadataEntryShape({ downloadDate: 1_700_000_000_000 }), true)
    })

    it("rejects null, arrays, and mistyped optional fields", () => {
        assert.equal(isDownloadMetadataEntryShape(null), false)
        assert.equal(isDownloadMetadataEntryShape([]), false)
        assert.equal(isDownloadMetadataEntryShape("x"), false)
        assert.equal(isDownloadMetadataEntryShape({ guildId: 123 }), false)
        assert.equal(isDownloadMetadataEntryShape({ downloadDate: { when: 1 } }), false)
        assert.equal(isDownloadMetadataEntryShape({ originalUrl: null }), false)
        assert.equal(isDownloadMetadataEntryShape({ filePath: false }), false)
        assert.equal(isDownloadMetadataEntryShape({ guildId: "g", unexpected: true }), false)
    })
})

describe("collectValidGuildSettingsEntries", () => {
    it("keeps valid rows and records empty guild ids as failures", () => {
        const collected = collectValidGuildSettingsEntries({
            "guild-ok": { controlChannelId: "1" },
            "": { controlChannelId: "2" },
            "guild-two": { downloadsMaxMb: 50 },
        })
        assert.deepEqual(Object.keys(collected.validEntries).sort(), ["guild-ok", "guild-two"])
        assert.equal(collected.failedCount, 1)
        assert.deepEqual(collected.failedEntries, ["guild:"])
        assert.equal(collected.validEntries["guild-ok"]?.controlChannelId, "1")
    })
})

describe("collectValidDownloadMetadataEntries", () => {
    it("remaps file keys to composite store keys and trims guild ids", () => {
        const collected = collectValidDownloadMetadataEntries({
            "track.wav": {
                guildId: " guild-a ",
                originalUrl: "https://example.com/t",
            },
            "other.wav": {
                downloadDate: 42,
            },
        })
        const keyed = downloadMetadataStoreKey("guild-a", "track.wav")
        const unknownKeyed = downloadMetadataStoreKey("UNKNOWN", "other.wav")
        assert.equal(collected.failedCount, 0)
        assert.deepEqual(collected.failedEntries, [])
        assert.equal(collected.validEntries[keyed]?.guildId, "guild-a")
        assert.equal(collected.validEntries[keyed]?.originalUrl, "https://example.com/t")
        assert.equal(collected.validEntries[unknownKeyed]?.guildId, "UNKNOWN")
        assert.equal(collected.validEntries[unknownKeyed]?.downloadDate, 42)
    })

    it("counts empty file names and invalid shapes as failures without writing them", () => {
        const collected = collectValidDownloadMetadataEntries({
            "": { guildId: "guild-a" },
            "bad.wav": { guildId: 99 },
            "good.wav": { guildId: "guild-b" },
        })
        assert.equal(collected.failedCount, 2)
        assert.deepEqual(collected.failedEntries, ["file:", "file:bad.wav"])
        const goodKey = downloadMetadataStoreKey("guild-b", "good.wav")
        assert.deepEqual(Object.keys(collected.validEntries), [goodKey])
        assert.equal(collected.validEntries[goodKey]?.guildId, "guild-b")
    })
})
