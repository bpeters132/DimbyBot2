import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { memberMayJoinOccupiedVoice, resolveOccupiedVoiceChannelId } from "./sameVoiceChannel.js"

describe("resolveOccupiedVoiceChannelId", () => {
    it("prefers live bot Discord VC (local playback with no Lavalink player)", () => {
        const guild = {
            members: { me: { voice: { channelId: "bot-vc" } } },
        }
        assert.equal(resolveOccupiedVoiceChannelId(guild, null), "bot-vc")
    })

    it("falls back to player voiceChannelId when bot is not in a VC", () => {
        const guild = {
            members: { me: { voice: { channelId: null } } },
        }
        assert.equal(
            resolveOccupiedVoiceChannelId(guild, { voiceChannelId: "player-vc" }),
            "player-vc"
        )
    })

    it("returns null when idle", () => {
        const guild = {
            members: { me: { voice: { channelId: null } } },
        }
        assert.equal(resolveOccupiedVoiceChannelId(guild, null), null)
    })
})

describe("memberMayJoinOccupiedVoice", () => {
    it("allows any channel when nothing is occupied", () => {
        assert.equal(memberMayJoinOccupiedVoice(null, "any"), true)
    })

    it("requires the same channel when occupied", () => {
        assert.equal(memberMayJoinOccupiedVoice("vc-a", "vc-a"), true)
        assert.equal(memberMayJoinOccupiedVoice("vc-a", "vc-b"), false)
    })
})
