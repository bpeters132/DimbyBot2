import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { playbackStartedFromStartResult } from "./playbackStartedFlag.js"

describe("playbackStartedFromStartResult", () => {
    it("is true only for ok starts or when the player is already playing", () => {
        assert.equal(playbackStartedFromStartResult("ok", false), true)
        assert.equal(playbackStartedFromStartResult("deferred", true), true)
        assert.equal(playbackStartedFromStartResult("empty", true), true)
    })

    it("is false for deferred/empty/no_player when still idle (JIT prepare did not start audio)", () => {
        assert.equal(playbackStartedFromStartResult("deferred", false), false)
        assert.equal(playbackStartedFromStartResult("empty", false), false)
        assert.equal(playbackStartedFromStartResult("no_player", false), false)
    })
})
