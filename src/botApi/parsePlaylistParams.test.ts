import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    parseNewPosition,
    parsePlaylistId,
    parsePosition,
    parseStrictPositiveInt,
    parseTrackBody,
} from "./parsePlaylistParams.js"

describe("parseStrictPositiveInt", () => {
    it("accepts trimmed positive integers without leading zeros", () => {
        assert.equal(parseStrictPositiveInt("1"), 1)
        assert.equal(parseStrictPositiveInt("42"), 42)
        assert.equal(parseStrictPositiveInt(" 99 "), 99)
    })

    it("rejects zero, negatives, floats, leading zeros, and junk", () => {
        assert.equal(parseStrictPositiveInt("0"), null)
        assert.equal(parseStrictPositiveInt("-1"), null)
        assert.equal(parseStrictPositiveInt("1.5"), null)
        assert.equal(parseStrictPositiveInt("01"), null)
        assert.equal(parseStrictPositiveInt(""), null)
        assert.equal(parseStrictPositiveInt("1e2"), null)
        assert.equal(parseStrictPositiveInt("abc"), null)
    })
})

describe("parsePlaylistId / parsePosition", () => {
    it("share strict positive-int rules used by playlist routes", () => {
        assert.equal(parsePlaylistId("7"), 7)
        assert.equal(parsePosition("3"), 3)
        assert.equal(parsePlaylistId("0"), null)
        assert.equal(parsePosition("-2"), null)
    })
})

describe("parseNewPosition", () => {
    it("accepts integer numbers and digit strings", () => {
        assert.equal(parseNewPosition(1), 1)
        assert.equal(parseNewPosition(12), 12)
        assert.equal(parseNewPosition("5"), 5)
    })

    it("rejects floats, zero, negatives, and non-numeric values", () => {
        assert.equal(parseNewPosition(1.5), null)
        assert.equal(parseNewPosition(0), null)
        assert.equal(parseNewPosition(-1), null)
        assert.equal(parseNewPosition("01"), null)
        assert.equal(parseNewPosition(null), null)
        assert.equal(parseNewPosition(undefined), null)
        assert.equal(parseNewPosition({}), null)
    })
})

describe("parseTrackBody", () => {
    const valid = {
        title: " Song ",
        uri: " https://example.com/a ",
        author: " Artist ",
        duration: 1234.9,
        addedAt: "2026-01-02T03:04:05.000Z",
        thumbnailUrl: " https://cdn.example/t.jpg ",
    }

    it("accepts a well-formed body and normalizes fields", () => {
        const parsed = parseTrackBody(valid)
        assert.deepEqual(parsed, {
            title: "Song",
            uri: "https://example.com/a",
            author: "Artist",
            duration: 1234,
            thumbnailUrl: "https://cdn.example/t.jpg",
            addedAt: "2026-01-02T03:04:05.000Z",
        })
    })

    it("defaults blank author to Unknown and nulls blank thumbnails", () => {
        const parsed = parseTrackBody({ ...valid, author: "   ", thumbnailUrl: "  " })
        assert.equal(parsed?.author, "Unknown")
        assert.equal(parsed?.thumbnailUrl, null)
    })

    it("rejects missing title/uri, bad duration, and invalid dates", () => {
        assert.equal(parseTrackBody(null), null)
        assert.equal(parseTrackBody({ ...valid, title: "  " }), null)
        assert.equal(parseTrackBody({ ...valid, uri: "" }), null)
        assert.equal(parseTrackBody({ ...valid, author: 1 }), null)
        assert.equal(parseTrackBody({ ...valid, duration: -1 }), null)
        assert.equal(parseTrackBody({ ...valid, duration: Number.NaN }), null)
        assert.equal(parseTrackBody({ ...valid, addedAt: "not-a-date" }), null)
        assert.equal(parseTrackBody({ ...valid, addedAt: "" }), null)
    })
})
