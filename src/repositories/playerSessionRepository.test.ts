import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { playerSessionUnchangedDeleteWhere } from "./playerSessionRepository.js"

describe("playerSessionUnchangedDeleteWhere", () => {
    it("matches guild, voice channel, and updatedAt so a successor upsert cannot be deleted", () => {
        const updatedAt = new Date("2026-09-04T12:00:00.000Z")
        assert.deepEqual(
            playerSessionUnchangedDeleteWhere({
                guildId: "guild-1",
                voiceChannelId: "vc-old",
                updatedAt,
            }),
            {
                guildId: "guild-1",
                voiceChannelId: "vc-old",
                updatedAt,
            }
        )
    })
})
