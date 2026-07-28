import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    DEFAULT_DOWNLOADS_MAX_MB,
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
