import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import { afterEach, describe, it } from "node:test"
import type { YoutubeWatchEntry } from "../types/index.js"
import {
    getYoutubeChannelLease,
    initializeYoutubeAlertStore,
    resetYoutubeAlertStoreForTests,
    setYoutubeAlertStoreDbForTests,
} from "./youtubeAlertStore.js"
import { handleYoutubePubsubRequest } from "./youtubePubsubHttp.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"
const SECRET = "hub-secret-for-tests"
const PREV_SECRET = process.env.YOUTUBE_PUBSUB_HUB_SECRET

function watch(overrides: Partial<YoutubeWatchEntry> = {}): YoutubeWatchEntry {
    return {
        id: 1,
        guildId: "100",
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

function fakeRes(): ServerResponse & {
    statusCode: number
    endedBody: string
    headers: Record<string, string>
} {
    const state = {
        statusCode: 0,
        endedBody: "",
        headers: {} as Record<string, string>,
    }
    return {
        get statusCode() {
            return state.statusCode
        },
        set statusCode(value: number) {
            state.statusCode = value
        },
        headers: state.headers,
        endedBody: "",
        setHeader(name: string, value: string | number | readonly string[]) {
            state.headers[name.toLowerCase()] = String(value)
        },
        end(chunk?: string | Buffer) {
            state.endedBody =
                chunk == null ? "" : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk
            ;(this as { endedBody: string }).endedBody = state.endedBody
        },
    } as ServerResponse & {
        statusCode: number
        endedBody: string
        headers: Record<string, string>
    }
}

function fakeReq(opts: {
    method: string
    url?: string
    headers?: Record<string, string | string[]>
    bodyChunks?: Buffer[]
}): IncomingMessage {
    const ee = new EventEmitter() as IncomingMessage & EventEmitter
    ee.method = opts.method
    ee.url = opts.url ?? "/youtube/pubsub"
    ee.headers = opts.headers ?? {}
    ;(ee as IncomingMessage & { destroy: () => void }).destroy = () => {
        ee.emit("close")
    }
    queueMicrotask(() => {
        for (const chunk of opts.bodyChunks ?? []) {
            ee.emit("data", chunk)
        }
        ee.emit("end")
    })
    return ee
}

afterEach(() => {
    resetYoutubeAlertStoreForTests()
    setYoutubeAlertStoreDbForTests(null)
    if (PREV_SECRET === undefined) delete process.env.YOUTUBE_PUBSUB_HUB_SECRET
    else process.env.YOUTUBE_PUBSUB_HUB_SECRET = PREV_SECRET
})

describe("handleYoutubePubsubRequest GET", () => {
    it("returns 503 when the Upload Alert store is not ready", async () => {
        const res = fakeRes()
        await handleYoutubePubsubRequest(
            fakeReq({
                method: "GET",
                url: `/youtube/pubsub?hub.mode=subscribe&hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3D${CHANNEL_ID}&hub.challenge=abc`,
            }),
            res,
            null
        )
        assert.equal(res.statusCode, 503)
        assert.equal(res.endedBody, "Store not ready")
    })

    it("echoes the challenge and persists a positive lease", async () => {
        const leases: { channelId: string; expiresAt: Date }[] = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch()],
                alerts: [],
                seenByWatch: {},
                leases: [],
            }),
            upsertYoutubeChannelLease: async (channelId, leaseExpiresAt) => {
                leases.push({ channelId, expiresAt: leaseExpiresAt })
                return {
                    youtubeChannelId: channelId,
                    leaseExpiresAt,
                    updatedAt: new Date("2026-09-11T00:00:00.000Z"),
                }
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })

        const before = Date.now()
        const res = fakeRes()
        await handleYoutubePubsubRequest(
            fakeReq({
                method: "GET",
                url: `/youtube/pubsub?hub.mode=subscribe&hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3D${CHANNEL_ID}&hub.challenge=challenge-token&hub.lease_seconds=3600`,
            }),
            res,
            null
        )
        assert.equal(res.statusCode, 200)
        assert.equal(res.endedBody, "challenge-token")
        assert.equal(leases.length, 1)
        assert.equal(leases[0].channelId, CHANNEL_ID)
        const expectedMs = before + 3600 * 1000
        assert.ok(Math.abs(leases[0].expiresAt.getTime() - expectedMs) < 5000)
        assert.equal(getYoutubeChannelLease(CHANNEL_ID)?.youtubeChannelId, CHANNEL_ID)
    })

    it("does not save a lease when hub.lease_seconds is not a positive number", async () => {
        let upserts = 0
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch()],
                alerts: [],
                seenByWatch: {},
                leases: [],
            }),
            upsertYoutubeChannelLease: async (channelId, leaseExpiresAt) => {
                upserts++
                return {
                    youtubeChannelId: channelId,
                    leaseExpiresAt,
                    updatedAt: new Date(),
                }
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })

        const res = fakeRes()
        await handleYoutubePubsubRequest(
            fakeReq({
                method: "GET",
                url: `/youtube/pubsub?hub.mode=subscribe&hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3D${CHANNEL_ID}&hub.challenge=tok&hub.lease_seconds=0`,
            }),
            res,
            null
        )
        assert.equal(res.statusCode, 200)
        assert.equal(res.endedBody, "tok")
        assert.equal(upserts, 0)
        assert.equal(getYoutubeChannelLease(CHANNEL_ID), undefined)
    })
})

describe("handleYoutubePubsubRequest POST and methods", () => {
    it("rejects non-GET/POST with 405", async () => {
        const res = fakeRes()
        await handleYoutubePubsubRequest(fakeReq({ method: "PUT" }), res, null)
        assert.equal(res.statusCode, 405)
        assert.equal(res.endedBody, "Method Not Allowed")
    })

    it("rejects oversized bodies with 413", async () => {
        const res = fakeRes()
        const huge = Buffer.alloc(512 * 1024 + 1, 0x61)
        await handleYoutubePubsubRequest(fakeReq({ method: "POST", bodyChunks: [huge] }), res, null)
        assert.equal(res.statusCode, 413)
        assert.equal(res.endedBody, "Payload Too Large")
    })

    it("rejects POST when the hub secret is unset", async () => {
        delete process.env.YOUTUBE_PUBSUB_HUB_SECRET
        const res = fakeRes()
        await handleYoutubePubsubRequest(
            fakeReq({ method: "POST", bodyChunks: [Buffer.from("<feed/>")] }),
            res,
            null,
            { warn() {} }
        )
        assert.equal(res.statusCode, 403)
        assert.equal(res.endedBody, "Forbidden")
    })

    it("rejects POST with a bad hub signature", async () => {
        process.env.YOUTUBE_PUBSUB_HUB_SECRET = SECRET
        const res = fakeRes()
        await handleYoutubePubsubRequest(
            fakeReq({
                method: "POST",
                headers: { "x-hub-signature-256": "sha256=deadbeef" },
                bodyChunks: [Buffer.from("<feed/>")],
            }),
            res,
            null,
            { warn() {} }
        )
        assert.equal(res.statusCode, 403)
        assert.equal(res.endedBody, "Forbidden")
    })

    it("accepts a signed POST and returns 204 without a Discord client", async () => {
        process.env.YOUTUBE_PUBSUB_HUB_SECRET = SECRET
        const body = Buffer.from(
            "<feed xmlns:yt='http://www.youtube.com/xml/schemas/2015'><entry><yt:videoId>aaaaaaaaaaa</yt:videoId></entry></feed>"
        )
        const hex = createHmac("sha256", SECRET).update(body).digest("hex")
        const res = fakeRes()
        await handleYoutubePubsubRequest(
            fakeReq({
                method: "POST",
                headers: { "x-hub-signature-256": `sha256=${hex}` },
                bodyChunks: [body],
            }),
            res,
            null
        )
        assert.equal(res.statusCode, 204)
        assert.equal(res.endedBody, "")
    })
})
