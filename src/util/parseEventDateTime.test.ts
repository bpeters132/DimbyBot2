import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseEventDateTime } from "./parseEventDateTime.js"
import { formatDuration } from "./formatDuration.js"

describe("parseEventDateTime", () => {
    it("converts a Chicago wall time to an epoch second", () => {
        const result = parseEventDateTime("2026-01-15", "18:30", "America/Chicago")
        assert.equal(result.ok, true)
        if (!result.ok) return
        // 2026-01-15 18:30 CST = 2026-01-16 00:30 UTC
        assert.equal(result.epochSeconds, Date.UTC(2026, 0, 16, 0, 30) / 1000)
    })

    it("rejects bad formats, unknown zones, and impossible calendar dates", () => {
        assert.equal(parseEventDateTime("15-01-2026", "18:30", "UTC").ok, false)
        assert.equal(parseEventDateTime("2026-01-15", "25:00", "UTC").ok, false)
        assert.equal(parseEventDateTime("2026-01-15", "18:30", "Not/AZone").ok, false)
        assert.equal(parseEventDateTime("2026-02-30", "12:00", "UTC").ok, false)
    })
})

describe("formatDuration", () => {
    it("formats mm:ss and hh:mm:ss, and guards non-finite input", () => {
        assert.equal(formatDuration(65_000), "01:05")
        assert.equal(formatDuration(3_661_000), "01:01:01")
        assert.equal(formatDuration(0), "00:00")
        assert.equal(formatDuration(Number.NaN), "00:00")
        assert.equal(formatDuration(Number.POSITIVE_INFINITY), "00:00")
    })
})
