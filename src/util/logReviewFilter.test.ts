import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    DISCORD_MESSAGE_LIMIT,
    lastMatchingLogLines,
    logReviewHeader,
    logReviewInlineContent,
    logReviewNoMatchContent,
} from "./logReviewFilter.js"

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

describe("logReview replies stay under Discord's 2000-character limit", () => {
    it("truncates a long filter in the no-match reply", () => {
        const filter = "x".repeat(2000)
        const content = logReviewNoMatchContent(filter)
        assert.ok(content.length < DISCORD_MESSAGE_LIMIT)
        assert.ok(content.includes("…"))
    })

    it("truncates a long filter in the attachment header", () => {
        const filter = "x".repeat(2000)
        const header = logReviewHeader(50, filter, "recent.log")
        assert.ok(header.length < DISCORD_MESSAGE_LIMIT)
        assert.ok(header.includes("…"))
    })

    it("keeps the inline reply under the Discord limit when recentText is 1800 chars", () => {
        const filter = "x".repeat(1800)
        const header = logReviewHeader(50, filter, "recent.log")
        const inline = logReviewInlineContent(header, "y".repeat(1800))
        assert.ok(inline.length <= DISCORD_MESSAGE_LIMIT)
    })
})
