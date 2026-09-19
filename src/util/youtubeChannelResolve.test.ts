import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    extractYoutubeChannelId,
    parseYoutubeChannelInput,
    resolveYoutubeChannel,
} from "./youtubeChannelResolve.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

describe("parseYoutubeChannelInput", () => {
    it("accepts a UC channel id", () => {
        assert.deepEqual(parseYoutubeChannelInput(CHANNEL_ID), {
            kind: "channelId",
            channelId: CHANNEL_ID,
        })
    })

    it("accepts an @handle and a handle URL", () => {
        assert.deepEqual(parseYoutubeChannelInput("@LinusTechTips"), {
            kind: "handle",
            handle: "@LinusTechTips",
        })
        const parsed = parseYoutubeChannelInput("https://www.youtube.com/@LinusTechTips")
        assert.deepEqual(parsed, { kind: "handle", handle: "@LinusTechTips" })
    })

    it("accepts a /channel/ URL and a watch URL", () => {
        assert.deepEqual(
            parseYoutubeChannelInput(`https://www.youtube.com/channel/${CHANNEL_ID}`),
            { kind: "channelId", channelId: CHANNEL_ID }
        )
        const video = parseYoutubeChannelInput("https://youtu.be/dQw4w9WgXcQ")
        assert.deepEqual(video, { kind: "videoId", videoId: "dQw4w9WgXcQ" })
    })

    it("accepts watch, shorts, embed, and live video URLs (incl. m. / music. hosts)", () => {
        const videoId = "dQw4w9WgXcQ"
        assert.deepEqual(parseYoutubeChannelInput(`https://www.youtube.com/watch?v=${videoId}`), {
            kind: "videoId",
            videoId,
        })
        assert.deepEqual(parseYoutubeChannelInput(`https://www.youtube.com/shorts/${videoId}`), {
            kind: "videoId",
            videoId,
        })
        assert.deepEqual(parseYoutubeChannelInput(`https://www.youtube.com/embed/${videoId}`), {
            kind: "videoId",
            videoId,
        })
        assert.deepEqual(parseYoutubeChannelInput(`https://www.youtube.com/live/${videoId}`), {
            kind: "videoId",
            videoId,
        })
        assert.deepEqual(parseYoutubeChannelInput(`https://m.youtube.com/watch?v=${videoId}`), {
            kind: "videoId",
            videoId,
        })
        assert.deepEqual(parseYoutubeChannelInput(`https://music.youtube.com/watch?v=${videoId}`), {
            kind: "videoId",
            videoId,
        })
    })

    it("treats /c/ and /user/ URLs as pages to scrape", () => {
        assert.deepEqual(parseYoutubeChannelInput("https://www.youtube.com/c/LinusTechTips"), {
            kind: "page",
            url: "https://www.youtube.com/c/LinusTechTips",
        })
        assert.deepEqual(parseYoutubeChannelInput("https://www.youtube.com/user/LinusTechTips"), {
            kind: "page",
            url: "https://www.youtube.com/user/LinusTechTips",
        })
    })

    it("accepts a scheme-less youtube.com handle URL", () => {
        assert.deepEqual(parseYoutubeChannelInput("youtube.com/@LinusTechTips"), {
            kind: "handle",
            handle: "@LinusTechTips",
        })
    })

    it("rejects empty, non-YouTube, and lookalike hosts", () => {
        assert.equal(parseYoutubeChannelInput("").kind, "invalid")
        assert.equal(parseYoutubeChannelInput("https://example.com/foo").kind, "invalid")
        assert.equal(
            parseYoutubeChannelInput(`https://youtube.com.evil.example/channel/${CHANNEL_ID}`).kind,
            "invalid"
        )
        assert.equal(parseYoutubeChannelInput("javascript:alert(1)").kind, "invalid")
    })
})

describe("extractYoutubeChannelId", () => {
    it("reads a channel id from HTML or JSON", () => {
        assert.equal(
            extractYoutubeChannelId(
                `<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL_ID}">`
            ),
            CHANNEL_ID
        )
        assert.equal(extractYoutubeChannelId(`{"channelId":"${CHANNEL_ID}"}`), CHANNEL_ID)
        assert.equal(extractYoutubeChannelId(`{"externalId":"${CHANNEL_ID}"}`), CHANNEL_ID)
        assert.equal(extractYoutubeChannelId(CHANNEL_ID), CHANNEL_ID)
        assert.equal(extractYoutubeChannelId("not a channel"), null)
        assert.equal(extractYoutubeChannelId("UCtooshort"), null)
    })
})

describe("resolveYoutubeChannel", () => {
    it("resolves a channel id via the RSS title", async () => {
        const identity = await resolveYoutubeChannel(CHANNEL_ID, async (url) => {
            assert.match(url, /feeds\/videos\.xml/)
            return {
                ok: true,
                status: 200,
                text: `<feed><title>Linus Tech Tips</title></feed>`,
            }
        })
        assert.deepEqual(identity, { channelId: CHANNEL_ID, displayName: "Linus Tech Tips" })
    })

    it("returns null when RSS is missing", async () => {
        const identity = await resolveYoutubeChannel(CHANNEL_ID, async () => ({
            ok: false,
            status: 404,
            text: "",
        }))
        assert.equal(identity, null)
    })

    it("returns null for unparseable admin input without fetching", async () => {
        let fetched = false
        const identity = await resolveYoutubeChannel(
            "https://example.com/not-youtube",
            async () => {
                fetched = true
                return { ok: true, status: 200, text: "" }
            }
        )
        assert.equal(identity, null)
        assert.equal(fetched, false)
    })

    it("resolves an @handle via the channel page then RSS title", async () => {
        const identity = await resolveYoutubeChannel("@LinusTechTips", async (url) => {
            if (url.includes("/@LinusTechTips")) {
                return {
                    ok: true,
                    status: 200,
                    text: `"channelId":"${CHANNEL_ID}"`,
                }
            }
            if (url.includes("feeds/videos.xml")) {
                return {
                    ok: true,
                    status: 200,
                    text: `<feed><title>Linus Tech Tips</title></feed>`,
                }
            }
            throw new Error(`unexpected fetch ${url}`)
        })
        assert.deepEqual(identity, { channelId: CHANNEL_ID, displayName: "Linus Tech Tips" })
    })

    it("resolves a watch URL via oEmbed author_url, preferring oEmbed display name", async () => {
        const identity = await resolveYoutubeChannel(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            async (url) => {
                if (url.includes("/oembed")) {
                    return {
                        ok: true,
                        status: 200,
                        text: JSON.stringify({
                            author_url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
                            author_name: "  LTT  ",
                        }),
                    }
                }
                if (url.includes("/channel/")) {
                    return {
                        ok: true,
                        status: 200,
                        text: `"channelId":"${CHANNEL_ID}"`,
                    }
                }
                if (url.includes("feeds/videos.xml")) {
                    return {
                        ok: true,
                        status: 200,
                        text: `<feed><title>From RSS</title></feed>`,
                    }
                }
                throw new Error(`unexpected fetch ${url}`)
            }
        )
        assert.deepEqual(identity, { channelId: CHANNEL_ID, displayName: "LTT" })
    })

    it("falls back to the watch page when oEmbed JSON is unusable", async () => {
        const identity = await resolveYoutubeChannel(
            "https://youtu.be/dQw4w9WgXcQ",
            async (url) => {
                if (url.includes("/oembed")) {
                    return { ok: true, status: 200, text: "not-json" }
                }
                if (url.includes("/watch?v=dQw4w9WgXcQ")) {
                    return {
                        ok: true,
                        status: 200,
                        text: `"channelId":"${CHANNEL_ID}"`,
                    }
                }
                if (url.includes("feeds/videos.xml")) {
                    return {
                        ok: true,
                        status: 200,
                        text: `<feed><title>Watch fallback</title></feed>`,
                    }
                }
                throw new Error(`unexpected fetch ${url}`)
            }
        )
        assert.deepEqual(identity, { channelId: CHANNEL_ID, displayName: "Watch fallback" })
    })
})
