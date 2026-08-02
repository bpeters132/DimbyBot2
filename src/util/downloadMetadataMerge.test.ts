import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { downloadMetadataStoreKey } from "./downloadMetadataKeys.js"
import { mergeDownloadMetadataForSave } from "./downloadMetadataMerge.js"

describe("mergeDownloadMetadataForSave", () => {
    const guildId = "guild-1"
    const keepKey = downloadMetadataStoreKey(guildId, "keep.wav")
    const dropKey = downloadMetadataStoreKey(guildId, "drop.wav")

    it("strips deleteStoreKeys from the db snapshot so upsert cannot resurrect them", () => {
        const dbStore = {
            [keepKey]: { guildId, originalUrl: "https://keep" },
            [dropKey]: { guildId, originalUrl: "https://drop" },
        }
        // Cleanup callers remove keys from the in-memory map and pass deleteStoreKeys only
        // (no touchedStoreKeys). Previously merged stayed equal to dbStore and the repository
        // deleted then upserted the dropped row in the same transaction.
        const nextCache = {
            [keepKey]: { guildId, originalUrl: "https://keep" },
        }
        const merged = mergeDownloadMetadataForSave(dbStore, nextCache, {
            deleteStoreKeys: [dropKey],
        })
        assert.deepEqual(Object.keys(merged).sort(), [keepKey])
        assert.equal(dropKey in merged, false)
        assert.equal(merged[keepKey]?.originalUrl, "https://keep")
    })

    it("applies touched upserts without clobbering untouched db keys", () => {
        const otherKey = downloadMetadataStoreKey(guildId, "other.wav")
        const dbStore = {
            [keepKey]: { guildId, originalUrl: "https://old-keep" },
            [otherKey]: { guildId, originalUrl: "https://other" },
        }
        const nextCache = {
            [keepKey]: { guildId, originalUrl: "https://new-keep" },
        }
        const merged = mergeDownloadMetadataForSave(dbStore, nextCache, {
            touchedStoreKeys: [keepKey],
        })
        assert.equal(merged[keepKey]?.originalUrl, "https://new-keep")
        assert.equal(merged[otherKey]?.originalUrl, "https://other")
    })

    it("drops touched keys that are absent from nextCache", () => {
        const dbStore = {
            [keepKey]: { guildId },
            [dropKey]: { guildId },
        }
        const merged = mergeDownloadMetadataForSave(
            dbStore,
            { [keepKey]: { guildId } },
            {
                touchedStoreKeys: [keepKey, dropKey],
                deleteStoreKeys: [dropKey],
            }
        )
        assert.equal(dropKey in merged, false)
        assert.equal(keepKey in merged, true)
    })
})
