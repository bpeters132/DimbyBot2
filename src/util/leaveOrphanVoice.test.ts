import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { shouldDisconnectOrphanVoice } from "./leaveOrphanVoice.js"

describe("shouldDisconnectOrphanVoice", () => {
    it("disconnects only when there is no Lavalink player and the bot is still in a VC", () => {
        assert.equal(shouldDisconnectOrphanVoice(false, true), true)
        assert.equal(shouldDisconnectOrphanVoice(false, false), false)
        assert.equal(shouldDisconnectOrphanVoice(true, true), false)
        assert.equal(shouldDisconnectOrphanVoice(true, false), false)
    })
})
