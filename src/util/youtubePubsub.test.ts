import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { describe, it } from "node:test"
import {
    isYoutubePubsubPath,
    verifyYoutubePubsubSignature,
    youtubePubsubCallbackUrlFromEnv,
    youtubePubsubVerifyResponse,
} from "./youtubePubsub.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

describe("isYoutubePubsubPath", () => {
    it("matches /youtube/pubsub with or without a trailing slash", () => {
        assert.equal(isYoutubePubsubPath("/youtube/pubsub"), true)
        assert.equal(isYoutubePubsubPath("/youtube/pubsub/"), true)
        assert.equal(isYoutubePubsubPath("/api/youtube/pubsub"), false)
        assert.equal(isYoutubePubsubPath("/health"), false)
    })
})

describe("youtubePubsubCallbackUrlFromEnv", () => {
    it("requires https", () => {
        assert.equal(
            youtubePubsubCallbackUrlFromEnv({
                YOUTUBE_PUBSUB_CALLBACK_URL: "https://bot.example.com/youtube/pubsub",
            }),
            "https://bot.example.com/youtube/pubsub"
        )
        assert.equal(
            youtubePubsubCallbackUrlFromEnv({
                YOUTUBE_PUBSUB_CALLBACK_URL: "http://bot.example.com/youtube/pubsub",
            }),
            null
        )
    })
})

describe("youtubePubsubVerifyResponse", () => {
    it("echoes the challenge for a known channel topic", () => {
        const result = youtubePubsubVerifyResponse(
            {
                "hub.mode": "subscribe",
                "hub.topic": `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
                "hub.challenge": "abc123",
            },
            new Set([CHANNEL_ID])
        )
        assert.deepEqual(result, { status: 200, body: "abc123" })
    })

    it("accepts unsubscribe challenges for known topics", () => {
        const result = youtubePubsubVerifyResponse(
            {
                "hub.mode": "unsubscribe",
                "hub.topic": `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
                "hub.challenge": "bye",
            },
            new Set([CHANNEL_ID])
        )
        assert.deepEqual(result, { status: 200, body: "bye" })
    })

    it("rejects unknown topics", () => {
        const result = youtubePubsubVerifyResponse(
            {
                "hub.mode": "subscribe",
                "hub.topic": `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
                "hub.challenge": "abc123",
            },
            new Set()
        )
        assert.equal(result.status, 404)
    })

    it("rejects missing mode, topic, or challenge", () => {
        const topic = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`
        const known = new Set([CHANNEL_ID])
        assert.equal(
            youtubePubsubVerifyResponse({ "hub.topic": topic, "hub.challenge": "x" }, known).status,
            400
        )
        assert.equal(
            youtubePubsubVerifyResponse({ "hub.mode": "subscribe", "hub.challenge": "x" }, known)
                .status,
            400
        )
        assert.equal(
            youtubePubsubVerifyResponse({ "hub.mode": "subscribe", "hub.topic": topic }, known)
                .status,
            400
        )
    })
})

describe("verifyYoutubePubsubSignature", () => {
    it("accepts a matching sha256 HMAC", () => {
        const body = Buffer.from("<feed/>")
        const secret = "hub-secret"
        const hex = createHmac("sha256", secret).update(body).digest("hex")
        assert.equal(
            verifyYoutubePubsubSignature(body, { signature256: `sha256=${hex}` }, secret),
            true
        )
        assert.equal(
            verifyYoutubePubsubSignature(body, { signature256: "sha256=deadbeef" }, secret),
            false
        )
    })

    it("accepts sha1 when sha256 is absent and rejects missing signatures", () => {
        const body = Buffer.from("<feed/>")
        const secret = "hub-secret"
        const hex = createHmac("sha1", secret).update(body).digest("hex")
        assert.equal(verifyYoutubePubsubSignature(body, { signature: `sha1=${hex}` }, secret), true)
        assert.equal(verifyYoutubePubsubSignature(body, {}, secret), false)
        assert.equal(verifyYoutubePubsubSignature(body, { signature: "md5=abc" }, secret), false)
    })
})
