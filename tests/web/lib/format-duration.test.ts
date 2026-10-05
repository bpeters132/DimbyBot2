import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { formatDurationMs } from "@/lib/format-duration"

describe("formatDurationMs", () => {
    it("returns 00:00 for non-positive or non-finite values", () => {
        assert.equal(formatDurationMs(0), "00:00")
        assert.equal(formatDurationMs(-1), "00:00")
        assert.equal(formatDurationMs(Number.NaN), "00:00")
    })

    it("formats minutes and seconds", () => {
        assert.equal(formatDurationMs(1000), "00:01")
        assert.equal(formatDurationMs(61_000), "01:01")
    })

    it("formats hours when the duration is at least an hour", () => {
        assert.equal(formatDurationMs(3_600_000), "01:00:00")
    })
})
