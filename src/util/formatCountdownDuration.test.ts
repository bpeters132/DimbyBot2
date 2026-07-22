import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatCountdownDuration } from "./formatCountdownDuration.js"

describe("formatCountdownDuration", () => {
    it("returns Event started! for non-positive or non-finite input", () => {
        assert.equal(formatCountdownDuration(0), "Event started!")
        assert.equal(formatCountdownDuration(-1), "Event started!")
        assert.equal(formatCountdownDuration(Number.NaN), "Event started!")
        assert.equal(formatCountdownDuration(Number.POSITIVE_INFINITY), "Event started!")
    })

    it("uses Less than a minute for sub-minute remainders", () => {
        assert.equal(formatCountdownDuration(1), "Less than a minute")
        assert.equal(formatCountdownDuration(59_999), "Less than a minute")
    })

    it("formats days, hours, and minutes without zero units or seconds", () => {
        assert.equal(formatCountdownDuration(60_000), "1 minute")
        assert.equal(formatCountdownDuration(2 * 60_000), "2 minutes")
        assert.equal(formatCountdownDuration(60 * 60_000), "1 hour")
        assert.equal(formatCountdownDuration(2 * 60 * 60_000 + 3 * 60_000), "2 hours, 3 minutes")
        assert.equal(
            formatCountdownDuration(3 * 24 * 60 * 60_000 + 4 * 60 * 60_000 + 20 * 60_000),
            "3 days, 4 hours, 20 minutes"
        )
        assert.equal(formatCountdownDuration(24 * 60 * 60_000), "1 day")
        // Sub-minute remainder after whole minutes is dropped (no seconds).
        assert.equal(formatCountdownDuration(90_000), "1 minute")
    })
})
