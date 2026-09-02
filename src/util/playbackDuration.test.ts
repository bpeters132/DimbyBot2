import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    PLAYBACK_DURATION_STRETCH_SLACK_MS,
    stretchedPlaybackDurationMs,
} from "./playbackDuration.js"

describe("stretchedPlaybackDurationMs", () => {
    it("returns null when position is still inside the stamped duration", () => {
        assert.equal(stretchedPlaybackDurationMs(180000, 120000), null)
        assert.equal(stretchedPlaybackDurationMs(180000, 180000), null)
    })

    it("returns null when the stamp is unknown", () => {
        assert.equal(stretchedPlaybackDurationMs(0, 90_000), null)
        assert.equal(stretchedPlaybackDurationMs(-1, 90_000), null)
        assert.equal(stretchedPlaybackDurationMs(Number.NaN, 90_000), null)
    })

    it("stretches past the stamp with slack so the bar is not glued at 100%", () => {
        assert.equal(
            stretchedPlaybackDurationMs(180000, 181000),
            181000 + PLAYBACK_DURATION_STRETCH_SLACK_MS
        )
        assert.equal(PLAYBACK_DURATION_STRETCH_SLACK_MS, 1000)
    })
})
