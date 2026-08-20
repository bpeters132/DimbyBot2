import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { lastMatchingLogLines } from "./logReviewFilter.js"

describe("lastMatchingLogLines", () => {
    const lines = [
        "INFO a",
        "DEBUG [YoutubeCompanion] resolving",
        "WARN other",
        "ERROR [YoutubeCompanion] down",
    ]

    it("returns the last N lines when filter is empty", () => {
        assert.deepEqual(lastMatchingLogLines(lines, "", 2), [
            "WARN other",
            "ERROR [YoutubeCompanion] down",
        ])
        assert.deepEqual(lastMatchingLogLines(lines, null, 2), [
            "WARN other",
            "ERROR [YoutubeCompanion] down",
        ])
    })

    it("filters case-insensitively then takes the last N matches", () => {
        assert.deepEqual(lastMatchingLogLines(lines, "youtubecompanion", 10), [
            "DEBUG [YoutubeCompanion] resolving",
            "ERROR [YoutubeCompanion] down",
        ])
        assert.deepEqual(lastMatchingLogLines(lines, "YoutubeCompanion", 1), [
            "ERROR [YoutubeCompanion] down",
        ])
    })

    it("returns an empty list when nothing matches", () => {
        assert.deepEqual(lastMatchingLogLines(lines, "nope", 50), [])
    })
})
