import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    APPROX_WAV_MIB_PER_MINUTE,
    DEFAULT_DOWNLOADS_MAX_MB,
    buildYtDlpMatchFilter,
    isCustomDownloadsMaxMb,
    resolveDownloadsMaxMb,
} from "./downloadsMaxMb.js"

describe("resolveDownloadsMaxMb", () => {
    it("returns a finite custom limit of at least 1 MB", () => {
        assert.equal(resolveDownloadsMaxMb(250), 250)
        assert.equal(resolveDownloadsMaxMb("1000"), 1000)
        assert.equal(resolveDownloadsMaxMb(1), 1)
        assert.equal(resolveDownloadsMaxMb("12.5"), 12.5)
    })

    it("falls back for missing, non-finite, zero, and negative values", () => {
        assert.equal(resolveDownloadsMaxMb(undefined), DEFAULT_DOWNLOADS_MAX_MB)
        assert.equal(resolveDownloadsMaxMb(null), DEFAULT_DOWNLOADS_MAX_MB)
        assert.equal(resolveDownloadsMaxMb(""), DEFAULT_DOWNLOADS_MAX_MB)
        assert.equal(resolveDownloadsMaxMb("nope"), DEFAULT_DOWNLOADS_MAX_MB)
        assert.equal(resolveDownloadsMaxMb(Number.NaN), DEFAULT_DOWNLOADS_MAX_MB)
        assert.equal(resolveDownloadsMaxMb(0), DEFAULT_DOWNLOADS_MAX_MB)
        assert.equal(resolveDownloadsMaxMb(-5), DEFAULT_DOWNLOADS_MAX_MB)
        assert.equal(resolveDownloadsMaxMb(Number.POSITIVE_INFINITY), DEFAULT_DOWNLOADS_MAX_MB)
    })

    it("honors an explicit default override", () => {
        assert.equal(resolveDownloadsMaxMb(0, 42), 42)
    })
})

describe("isCustomDownloadsMaxMb", () => {
    it("is true only for finite limits ≥ 1", () => {
        assert.equal(isCustomDownloadsMaxMb(1), true)
        assert.equal(isCustomDownloadsMaxMb(500), true)
        assert.equal(isCustomDownloadsMaxMb("12.5"), true)
        assert.equal(isCustomDownloadsMaxMb("12.5abc"), true)
        assert.equal(isCustomDownloadsMaxMb(0), false)
        assert.equal(isCustomDownloadsMaxMb(-1), false)
        assert.equal(isCustomDownloadsMaxMb(undefined), false)
        assert.equal(isCustomDownloadsMaxMb("abc"), false)
    })

    it("agrees with resolveDownloadsMaxMb on trailing-junk numbers", () => {
        const raw = "12.5abc"
        assert.equal(isCustomDownloadsMaxMb(raw), true)
        assert.equal(resolveDownloadsMaxMb(raw), 12.5)
    })
})

describe("buildYtDlpMatchFilter", () => {
    it("rejects live streams and caps duration from the guild quota", () => {
        // 1000 MiB / 10 MiB/min → 100 min → 6000s
        assert.equal(
            buildYtDlpMatchFilter(1000),
            `!is_live & duration <= ${Math.floor((1000 / APPROX_WAV_MIB_PER_MINUTE) * 60)}`
        )
        assert.equal(buildYtDlpMatchFilter(1000), "!is_live & duration <= 6000")
    })

    it("floors duration at 60s so tiny quotas still allow short clips", () => {
        // 1 MiB would be 6s without the floor
        assert.equal(buildYtDlpMatchFilter(1), "!is_live & duration <= 60")
        assert.equal(buildYtDlpMatchFilter(0.5), "!is_live & duration <= 60")
    })

    it("scales linearly above the floor", () => {
        // 50 MiB → 5 min → 300s
        assert.equal(buildYtDlpMatchFilter(50), "!is_live & duration <= 300")
    })
})
