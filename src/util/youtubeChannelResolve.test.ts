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

    it("rejects empty and non-YouTube URLs", () => {
        assert.equal(parseYoutubeChannelInput("").kind, "invalid")
        assert.equal(parseYoutubeChannelInput("https://example.com/foo").kind, "invalid")
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
})
