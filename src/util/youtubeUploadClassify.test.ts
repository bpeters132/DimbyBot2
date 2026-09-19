import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    classifyFromFeedEntry,
    classifyUploadEvent,
    fetchYoutubeVideoDetails,
    youtubeDataApiKeyFromEnv,
} from "./youtubeUploadClassify.js"
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
            "premiere"
        )
        assert.equal(classifyUploadEvent({ title: "Fun #Shorts", durationSeconds: 200 }), "short")
        assert.equal(classifyUploadEvent({ durationSeconds: 45 }), "short")
        assert.equal(classifyUploadEvent({ durationSeconds: 200, title: "Review" }), "video")
        assert.equal(
            classifyUploadEvent({
                liveBroadcastContent: "live",
                title: "Clip #Shorts",
                durationSeconds: 600,
            }),
            "short"
        )
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

describe("youtubeDataApiKeyFromEnv", () => {
    it("returns a trimmed key and treats blank as unset", () => {
        assert.equal(youtubeDataApiKeyFromEnv({ YOUTUBE_DATA_API_KEY: "  abc  " }), "abc")
        assert.equal(youtubeDataApiKeyFromEnv({ YOUTUBE_DATA_API_KEY: "" }), null)
        assert.equal(youtubeDataApiKeyFromEnv({ YOUTUBE_DATA_API_KEY: "   " }), null)
        assert.equal(youtubeDataApiKeyFromEnv({}), null)
    })
})

describe("fetchYoutubeVideoDetails", () => {
    const VIDEO_ID = "dQw4w9WgXcQ"

    it("maps snippet, ISO duration, and liveBroadcastContent from videos.list", async () => {
        let requested: string | undefined
        const details = await fetchYoutubeVideoDetails(VIDEO_ID, "test-key", async (url) => {
            requested = url
            return {
                items: [
                    {
                        snippet: {
                            title: "Premiere night",
                            description: "Go live",
                            liveBroadcastContent: "live",
                        },
                        contentDetails: { duration: "PT10M" },
                    },
                ],
            }
        })
        assert.match(requested ?? "", /googleapis\.com\/youtube\/v3\/videos/)
        assert.match(requested ?? "", new RegExp(`id=${VIDEO_ID}`))
        assert.match(requested ?? "", /key=test-key/)
        assert.deepEqual(details, {
            title: "Premiere night",
            description: "Go live",
            url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
            durationSeconds: 600,
            liveBroadcastContent: "live",
        })
        assert.equal(classifyUploadEvent(details!), "premiere")
    })

    it("returns null when items are missing, duration is absent, or fetch throws", async () => {
        assert.equal(
            await fetchYoutubeVideoDetails(VIDEO_ID, "k", async () => ({ items: [] })),
            null
        )
        const noDuration = await fetchYoutubeVideoDetails(VIDEO_ID, "k", async () => ({
            items: [{ snippet: { title: "Open live", liveBroadcastContent: "live" } }],
        }))
        assert.deepEqual(noDuration, {
            title: "Open live",
            description: undefined,
            url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
            durationSeconds: null,
            liveBroadcastContent: "live",
        })
        assert.equal(classifyUploadEvent(noDuration!), "live")
        assert.equal(
            await fetchYoutubeVideoDetails(VIDEO_ID, "k", async () => {
                throw new Error("quota")
            }),
            null
        )
    })
})
