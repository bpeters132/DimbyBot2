import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolveSeekPositionMs } from "./seekPosition.js"

describe("resolveSeekPositionMs", () => {
    it("clamps within a finite track and rejects positions past the end", () => {
        assert.deepEqual(resolveSeekPositionMs(30, 120_000), { ok: true, seekMs: 30_000 })
        assert.deepEqual(resolveSeekPositionMs(120, 120_000), { ok: true, seekMs: 120_000 })
        assert.deepEqual(resolveSeekPositionMs(121, 120_000), {
            ok: false,
            reason: "past_end",
            durationSec: 120,
        })
        // Fractional seconds near the end still clamp to durationMs when allowed
        assert.deepEqual(resolveSeekPositionMs(119.6, 120_000), { ok: true, seekMs: 119_600 })
    })

    it("allows any non-negative position for streams / unknown duration", () => {
        assert.deepEqual(resolveSeekPositionMs(3600, 0), { ok: true, seekMs: 3_600_000 })
        assert.deepEqual(resolveSeekPositionMs(10, Number.NaN), { ok: true, seekMs: 10_000 })
        assert.deepEqual(resolveSeekPositionMs(-5, 0), { ok: true, seekMs: 0 })
    })

    it("treats non-finite position as zero", () => {
        assert.deepEqual(resolveSeekPositionMs(Number.NaN, 60_000), { ok: true, seekMs: 0 })
        assert.deepEqual(resolveSeekPositionMs(Number.POSITIVE_INFINITY, 60_000), {
            ok: true,
            seekMs: 0,
        })
    })
})
