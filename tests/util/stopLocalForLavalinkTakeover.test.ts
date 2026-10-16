import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getLocalPlayerState } from "../../src/util/localPlayer.js"
import {
    shouldStopLocalPlayerBeforeLavalinkTakeover,
    stopLocalPlaybackForLavalinkTakeover,
} from "../../src/util/stopLocalForLavalinkTakeover.js"

const client = { debug() {} }

describe("shouldStopLocalPlayerBeforeLavalinkTakeover", () => {
    it("stops whenever a local player state entry exists", () => {
        assert.equal(shouldStopLocalPlayerBeforeLavalinkTakeover(null), false)
        assert.equal(shouldStopLocalPlayerBeforeLavalinkTakeover(undefined), false)
        assert.equal(
            shouldStopLocalPlayerBeforeLavalinkTakeover({ isPlaying: true, trackTitle: "a" }),
            true
        )
        // Buffering / Idle mapped entries must also be torn down before Lavalink connect.
        assert.equal(
            shouldStopLocalPlayerBeforeLavalinkTakeover({ isPlaying: false, trackTitle: "a" }),
            true
        )
    })
})

describe("stopLocalPlaybackForLavalinkTakeover", () => {
    it("returns false without stopping when this guild has no mapped local player", async () => {
        const guildId = "guild-takeover-none"
        assert.equal(getLocalPlayerState(guildId), null)
        const stopped = await stopLocalPlaybackForLavalinkTakeover(client as never, guildId, 0)
        assert.equal(stopped, false)
        assert.equal(getLocalPlayerState(guildId), null)
    })
})
