import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { playlistPlayTimeoutMs } from "../web/lib/playlist-play-timeout.js"
import { sanitizeHttpUrl } from "../web/lib/url-utils.js"

describe("sanitizeHttpUrl", () => {
    it("accepts http(s) URLs and normalizes via URL", () => {
        assert.equal(sanitizeHttpUrl("https://example.com/a"), "https://example.com/a")
        assert.equal(sanitizeHttpUrl("http://example.com"), "http://example.com/")
    })

    it("rejects non-strings, empty values, and non-http(s) schemes", () => {
        assert.equal(sanitizeHttpUrl(null), null)
        assert.equal(sanitizeHttpUrl(undefined), null)
        assert.equal(sanitizeHttpUrl(""), null)
        assert.equal(sanitizeHttpUrl("javascript:alert(1)"), null)
        assert.equal(sanitizeHttpUrl("data:text/html,hi"), null)
        assert.equal(sanitizeHttpUrl("ftp://example.com/file"), null)
        assert.equal(sanitizeHttpUrl("not a url"), null)
    })
})

describe("playlistPlayTimeoutMs", () => {
    it("uses a one-track baseline for non-positive or non-finite counts", () => {
        assert.equal(playlistPlayTimeoutMs(1), 32_500)
        assert.equal(playlistPlayTimeoutMs(0), 32_500)
        assert.equal(playlistPlayTimeoutMs(-3), 32_500)
        assert.equal(playlistPlayTimeoutMs(Number.NaN), 32_500)
    })

    it("scales with track count and floors fractional counts", () => {
        assert.equal(playlistPlayTimeoutMs(2), 35_000)
        assert.equal(playlistPlayTimeoutMs(2.9), 35_000)
        assert.equal(playlistPlayTimeoutMs(10), 55_000)
    })

    it("caps at five minutes for very large playlists", () => {
        assert.equal(playlistPlayTimeoutMs(200), 300_000)
        assert.equal(playlistPlayTimeoutMs(10_000), 300_000)
    })
})
