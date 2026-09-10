import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    ALL_UPLOAD_EVENT_TYPES,
    isUploadEventType,
    parseUploadEventTypes,
} from "./uploadEventType.js"

describe("isUploadEventType", () => {
    it("accepts every known Upload event type and rejects unknown strings", () => {
        for (const type of ALL_UPLOAD_EVENT_TYPES) {
            assert.equal(isUploadEventType(type), true)
        }
        assert.equal(isUploadEventType("live_stream"), false)
        assert.equal(isUploadEventType("Video"), false)
        assert.equal(isUploadEventType(""), false)
    })
})

describe("parseUploadEventTypes", () => {
    it("keeps only known types so persisted Alert rows stay typed", () => {
        assert.deepEqual(parseUploadEventTypes(["video", "bogus", "short", "Video"]), [
            "video",
            "short",
        ])
        assert.deepEqual(parseUploadEventTypes(["nope", "also-no"]), [])
        assert.deepEqual(parseUploadEventTypes([...ALL_UPLOAD_EVENT_TYPES]), [
            ...ALL_UPLOAD_EVENT_TYPES,
        ])
    })
})
