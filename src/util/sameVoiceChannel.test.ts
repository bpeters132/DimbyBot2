import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    memberMayControlPlayerVoice,
    memberMayJoinOccupiedVoice,
    resolveOccupiedVoiceChannelId,
} from "./sameVoiceChannel.js"

describe("memberMayControlPlayerVoice", () => {
    it("allows when the player has no voice channel id", () => {
        assert.equal(memberMayControlPlayerVoice(undefined, "vc-a"), true)
        assert.equal(memberMayControlPlayerVoice(null, "vc-a"), true)
        assert.equal(memberMayControlPlayerVoice("", "vc-a"), true)
    })

    it("allows when member is in the same channel as the player", () => {
        assert.equal(memberMayControlPlayerVoice("vc-a", "vc-a"), true)
    })

    it("rejects when member is in a different channel", () => {
        assert.equal(memberMayControlPlayerVoice("vc-a", "vc-b"), false)
    })
})

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
