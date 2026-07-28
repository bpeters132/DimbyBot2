import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    DOWNLOAD_METADATA_KEY_SEP,
    DOWNLOAD_METADATA_UNKNOWN_GUILD_ID,
    downloadMetadataEntryMatchesGuild,
    downloadMetadataFileBelongsToGuild,
    downloadMetadataKeysForFile,
    downloadMetadataStoreKey,
    effectiveDownloadMetadataGuildId,
    parseDownloadMetadataStoreKey,
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
