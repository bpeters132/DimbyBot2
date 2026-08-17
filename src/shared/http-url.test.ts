import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isValidHttpUrl, sanitizeHttpUrl } from "./http-url.js"

describe("sanitizeHttpUrl", () => {
    it("accepts http(s) URLs and normalizes via URL", () => {
        assert.equal(sanitizeHttpUrl("https://example.com/a"), "https://example.com/a")
        assert.equal(sanitizeHttpUrl("http://example.com"), "http://example.com/")
    })

    it("rejects non-strings, blanks, and non-http(s) schemes", () => {
        assert.equal(sanitizeHttpUrl(null), null)
        assert.equal(sanitizeHttpUrl(undefined), null)
        assert.equal(sanitizeHttpUrl(""), null)
        assert.equal(sanitizeHttpUrl("javascript:alert(1)"), null)
        assert.equal(sanitizeHttpUrl("data:text/html,hi"), null)
        assert.equal(sanitizeHttpUrl("ftp://example.com/file"), null)
        assert.equal(sanitizeHttpUrl("not a url"), null)
    })
})

describe("isValidHttpUrl", () => {
    it("accepts the same http(s) inputs as sanitizeHttpUrl", () => {
        assert.equal(isValidHttpUrl("https://cdn.example/cover.png"), true)
        assert.equal(isValidHttpUrl("http://example.com/img.jpg"), true)
    })

    it("rejects embed-unsafe schemes used as countdown image URLs", () => {
        assert.equal(isValidHttpUrl("javascript:alert(1)"), false)
        assert.equal(isValidHttpUrl("data:image/png;base64,abc"), false)
        assert.equal(isValidHttpUrl("ftp://files.example/a.png"), false)
        assert.equal(isValidHttpUrl(""), false)
        assert.equal(isValidHttpUrl("not a url"), false)
    })
})
