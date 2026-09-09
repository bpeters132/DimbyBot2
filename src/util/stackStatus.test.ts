import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { LavalinkManager } from "lavalink-client"
import {
    companionKeyLengthOk,
    companionOriginFromEnv,
    lavalinkNodeSummary,
    lavalinkRestOriginFromEnv,
    ytCipherOriginFromEnv,
} from "./stackStatus.js"

describe("companionKeyLengthOk", () => {
    it("accepts exactly 16 alphanumeric characters", () => {
        assert.equal(companionKeyLengthOk("changemechangeme"), true)
        assert.equal(companionKeyLengthOk("Abcdefghijklmno1"), true)
    })

    it("rejects wrong length or non-alphanumeric", () => {
        assert.equal(companionKeyLengthOk(""), false)
        assert.equal(companionKeyLengthOk("short"), false)
        assert.equal(companionKeyLengthOk("changemechangemeX"), false)
        assert.equal(companionKeyLengthOk("changeme-changem"), false)
        assert.equal(companionKeyLengthOk(" changemechangeme"), false)
        assert.equal(companionKeyLengthOk("changemechangeme "), false)
    })
})

describe("stackStatus origin helpers from env", () => {
    const keys = [
        "INVIDIOUS_COMPANION_URL",
        "LAVALINK_YOUTUBE_CIPHER_URL",
        "LAVALINK_HOST",
        "LAVALINK_PORT",
        "LAVALINK_SECURE",
    ] as const
    const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]])) as Record<
        (typeof keys)[number],
        string | undefined
    >

    function restoreEnv(): void {
        for (const key of keys) {
            if (prev[key] === undefined) delete process.env[key]
            else process.env[key] = prev[key]
        }
    }

    it("strips trailing slashes and defaults companion/cipher origins", () => {
        try {
            delete process.env.INVIDIOUS_COMPANION_URL
            delete process.env.LAVALINK_YOUTUBE_CIPHER_URL
            assert.equal(companionOriginFromEnv(), "http://invidious-companion:8282")
            assert.equal(ytCipherOriginFromEnv(), "http://yt-cipher:8001")

            process.env.INVIDIOUS_COMPANION_URL = "http://companion:8282///"
            process.env.LAVALINK_YOUTUBE_CIPHER_URL = " http://cipher:8001/ "
            assert.equal(companionOriginFromEnv(), "http://companion:8282")
            assert.equal(ytCipherOriginFromEnv(), "http://cipher:8001")
        } finally {
            restoreEnv()
        }
    })

    it("builds Lavalink REST origin from host/port/secure", () => {
        try {
            delete process.env.LAVALINK_HOST
            delete process.env.LAVALINK_PORT
            delete process.env.LAVALINK_SECURE
            assert.equal(lavalinkRestOriginFromEnv(), "http://lavalink:2333")

            process.env.LAVALINK_HOST = " lava.internal "
            process.env.LAVALINK_PORT = "443"
            process.env.LAVALINK_SECURE = "true"
            assert.equal(lavalinkRestOriginFromEnv(), "https://lava.internal:443")

            process.env.LAVALINK_SECURE = "TRUE"
            assert.equal(lavalinkRestOriginFromEnv(), "https://lava.internal:443")
            process.env.LAVALINK_SECURE = "yes"
            assert.equal(lavalinkRestOriginFromEnv(), "http://lava.internal:443")
        } finally {
            restoreEnv()
        }
    })

    it("summarizes Lavalink node connection counts", () => {
        const lavalink = {
            nodeManager: {
                nodes: new Map([
                    ["a", { connected: true }],
                    ["b", { connected: false }],
                    ["c", { connected: true }],
                ]),
            },
        } as unknown as LavalinkManager
        assert.deepEqual(lavalinkNodeSummary(lavalink), { nodeCount: 3, connected: 2 })
        assert.deepEqual(lavalinkNodeSummary({} as LavalinkManager), {
            nodeCount: 0,
            connected: 0,
        })
    })
})
