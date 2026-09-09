import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { classifyFromFeedEntry, classifyUploadEvent } from "./youtubeUploadClassify.js"
import type { YoutubeFeedEntry } from "./youtubeFeedParse.js"

function entry(overrides: Partial<YoutubeFeedEntry> = {}): YoutubeFeedEntry {
    return {
        videoId: "dQw4w9WgXcQ",
        channelId: "UCXuqSBlHAE6Xw-yeJA0Tunw",
        title: "A video",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        published: null,
        durationSeconds: 200,
        description: "",
        ...overrides,
    }
}

describe("classifyUploadEvent", () => {
    it("returns null for upcoming so we do not mark seen yet", () => {
        assert.equal(classifyUploadEvent({ liveBroadcastContent: "upcoming" }), null)
    })

    it("classifies live (including live with duration), short, and video", () => {
        assert.equal(classifyUploadEvent({ liveBroadcastContent: "live" }), "live")
        assert.equal(
            classifyUploadEvent({ liveBroadcastContent: "live", durationSeconds: 600 }),
            "live"
        )
        assert.equal(classifyUploadEvent({ title: "Fun #Shorts", durationSeconds: 200 }), "short")
        assert.equal(classifyUploadEvent({ durationSeconds: 45 }), "short")
        assert.equal(classifyUploadEvent({ durationSeconds: 200, title: "Review" }), "video")
    })
})

describe("classifyFromFeedEntry", () => {
    it("uses /shorts/ URLs from RSS", () => {
        assert.equal(
            classifyFromFeedEntry(
                entry({
                    url: "https://www.youtube.com/shorts/abcdefghijk",
                    durationSeconds: null,
                })
            ),
            "short"
        )
        assert.equal(classifyFromFeedEntry(entry()), "video")
    })
})
