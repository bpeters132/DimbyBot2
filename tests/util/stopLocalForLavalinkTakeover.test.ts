import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { shouldStopLocalPlayerBeforeLavalinkTakeover } from "../../src/util/stopLocalForLavalinkTakeover.js"

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
