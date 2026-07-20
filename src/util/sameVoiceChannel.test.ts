import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { memberMayControlPlayerVoice } from "./sameVoiceChannel.js"

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
