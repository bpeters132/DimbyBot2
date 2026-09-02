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
    it("uses a fixed short timeout regardless of playlist size", () => {
        assert.equal(playlistPlayTimeoutMs(), 30_000)
    })
})
