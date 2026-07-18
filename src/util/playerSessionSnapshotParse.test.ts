import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    parsePersistedQueueTrack,
    parsePlayerSessionSnapshot,
} from "./playerSessionSnapshotParse.js"

const validTrack = {
    title: "Song",
    author: "Artist",
    uri: "https://example.com/track",
    duration: 180000,
    encoded: null,
    requesterId: "123",
    thumbnailUrl: null,
    isStream: false,
}

function validSnapshot(overrides: Record<string, unknown> = {}) {
    return {
        version: 1,
        volume: 100,
        repeatMode: "off",
        paused: false,
        playing: true,
        autoplay: false,
        rrqEnabled: false,
        current: validTrack,
        queue: [],
        ...overrides,
    }
}

describe("parsePersistedQueueTrack", () => {
    it("accepts a well-formed track and trims string fields", () => {
        const parsed = parsePersistedQueueTrack({
            ...validTrack,
            title: "  Song  ",
            author: "  Artist ",
            uri: " https://example.com/track ",
        })
        assert.deepEqual(parsed, {
            ...validTrack,
            title: "Song",
            author: "Artist",
            uri: "https://example.com/track",
        })
    })

    it("rejects blank author (author validation regression)", () => {
        assert.equal(parsePersistedQueueTrack({ ...validTrack, author: "   " }), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, author: "" }), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, author: 42 }), null)
    })

    it("rejects non-finite duration", () => {
        assert.equal(parsePersistedQueueTrack({ ...validTrack, duration: Number.NaN }), null)
        assert.equal(
            parsePersistedQueueTrack({ ...validTrack, duration: Number.POSITIVE_INFINITY }),
            null
        )
        assert.equal(
            parsePersistedQueueTrack({ ...validTrack, duration: Number.NEGATIVE_INFINITY }),
            null
        )
    })

    it("rejects missing required fields and wrong optional types", () => {
        assert.equal(parsePersistedQueueTrack(null), null)
        assert.equal(parsePersistedQueueTrack([]), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, title: "" }), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, uri: " " }), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, isStream: "no" }), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, encoded: 1 }), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, requesterId: 9 }), null)
        assert.equal(parsePersistedQueueTrack({ ...validTrack, thumbnailUrl: false }), null)
    })
})

describe("parsePlayerSessionSnapshot", () => {
    it("accepts a valid v1 snapshot", () => {
        const parsed = parsePlayerSessionSnapshot(validSnapshot())
        assert.ok(parsed)
        assert.equal(parsed.version, 1)
        assert.equal(parsed.volume, 100)
        assert.equal(parsed.current?.title, "Song")
        assert.deepEqual(parsed.queue, [])
    })

    it("rejects non-finite volume (volume validation regression)", () => {
        assert.equal(parsePlayerSessionSnapshot(validSnapshot({ volume: Number.NaN })), null)
        assert.equal(
            parsePlayerSessionSnapshot(validSnapshot({ volume: Number.POSITIVE_INFINITY })),
            null
        )
        assert.equal(parsePlayerSessionSnapshot(validSnapshot({ volume: "100" })), null)
    })

    it("rejects bad version, repeatMode, flags, or corrupt queue entries", () => {
        assert.equal(parsePlayerSessionSnapshot(validSnapshot({ version: 2 })), null)
        assert.equal(parsePlayerSessionSnapshot(validSnapshot({ repeatMode: "loop" })), null)
        assert.equal(parsePlayerSessionSnapshot(validSnapshot({ paused: "no" })), null)
        assert.equal(parsePlayerSessionSnapshot(validSnapshot({ queue: null })), null)
        assert.equal(
            parsePlayerSessionSnapshot(validSnapshot({ queue: [{ ...validTrack, author: "" }] })),
            null
        )
        assert.equal(
            parsePlayerSessionSnapshot(
                validSnapshot({ current: { ...validTrack, duration: NaN } })
            ),
            null
        )
    })

    it("allows null current with a non-empty queue", () => {
        const parsed = parsePlayerSessionSnapshot(
            validSnapshot({ current: null, queue: [validTrack] })
        )
        assert.ok(parsed)
        assert.equal(parsed.current, null)
        assert.equal(parsed.queue.length, 1)
    })
})
