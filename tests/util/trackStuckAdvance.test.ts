import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import type {
    CompanionFetch,
    CompanionPlaybackConfig,
} from "../../src/util/youtubeCompanionPlayback.js"
import {
    armTrackStuckPlayPrepare,
    playWouldSendNullEncoded,
    shouldApplicationSkipOnTrackStuck,
} from "../../src/util/trackStuckAdvance.js"
import { isYoutubePlaybackReady } from "../../src/util/youtubePlaybackWindow.js"

const VIDEO_A = "dQw4w9WgXcQ"
const COMPANION_ORIGIN = "http://invidious-companion:8282"

function ytMeta(id: string): Track {
    return {
        encoded: "",
        info: {
            title: id,
            author: "Artist",
            uri: `https://www.youtube.com/watch?v=${id}`,
            duration: 1000,
            isStream: false,
            identifier: id,
            isSeekable: true,
            sourceName: "youtube",
            artworkUrl: null,
            isrc: null,
        },
        requester: undefined,
        userData: { queueMetadata: true },
    } as unknown as Track
}

function readyHttp(id: string): Track {
    return {
        encoded: `http-enc-${id}`,
        info: {
            title: id,
            author: "Artist",
            uri: `https://cdn.example/${id}.m4a`,
            duration: 1000,
            isStream: false,
            identifier: id,
            isSeekable: true,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
        },
        requester: undefined,
        userData: { invidiousCompanionResolved: true },
    } as unknown as Track
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    })
}

function companionOkFetch(): CompanionFetch {
    return async (url, init) => {
        if (init?.method === "POST") {
            return jsonResponse({
                playabilityStatus: { status: "OK" },
                streamingData: {
                    adaptiveFormats: [{ itag: 251, mimeType: "audio/webm; codecs=opus" }],
                },
            })
        }
        const href = typeof url === "string" ? url : url.toString()
        const id = new URL(href, COMPANION_ORIGIN).searchParams.get("id") ?? VIDEO_A
        return new Response(null, {
            status: 302,
            headers: { Location: `/companion/videoplayback?id=${id}` },
        })
    }
}

function configWithFetch(fetchImpl: CompanionFetch): CompanionPlaybackConfig {
    return {
        origin: COMPANION_ORIGIN,
        secretKey: "changemechangeme",
        fetchImpl,
        sleep: async () => undefined,
    }
}

function stuckPlayer(
    current: Track,
    guildId = "guild-stuck"
): Player & { repeatMode: string; playCalls: unknown[] } {
    const playCalls: unknown[] = []
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
    const bag = new Map<string, unknown>()
    let currentRef: Track | null = current
    const player = {
        guildId,
        repeatMode: "off",
        playCalls,
        queue: {
            get current() {
                return currentRef
            },
            set current(value: Track | null) {
                currentRef = value
            },
            tracks: [] as Track[],
            async splice() {
                return []
            },
        },
        LavalinkManager: {
            on(event: string, cb: (...args: unknown[]) => void) {
                const list = listeners.get(event) ?? []
                list.push(cb)
                listeners.set(event, list)
            },
            off(event: string, cb: (...args: unknown[]) => void) {
                const list = listeners.get(event) ?? []
                listeners.set(
                    event,
                    list.filter((x) => x !== cb)
                )
            },
        },
        node: {
            async updatePlayer() {
                for (const cb of listeners.get("trackEnd") ?? []) {
                    cb(player)
                }
            },
        },
        get: (key: string) => bag.get(key),
        set: (key: string, value: unknown) => {
            bag.set(key, value)
        },
        async setRepeatMode(mode: string) {
            player.repeatMode = mode
        },
        async search(query: string) {
            const id = (() => {
                try {
                    return new URL(query).searchParams.get("id") ?? "http"
                } catch {
                    return "http"
                }
            })()
            return {
                tracks: [
                    {
                        encoded: `http-enc-${id}`,
                        info: {
                            title: "http",
                            author: "http",
                            uri: query,
                            duration: 1,
                            isStream: false,
                            identifier: id,
                            isSeekable: true,
                            sourceName: "http",
                            artworkUrl: null,
                            isrc: null,
                        },
                    } as unknown as Track,
                ],
            }
        },
        async play(options?: unknown) {
            playCalls.push(options)
            return player
        },
    } as unknown as Player & { repeatMode: string; playCalls: unknown[] }
    return player
}

describe("shouldApplicationSkipOnTrackStuck", () => {
    it("is false so the app does not double-advance after lavalink-client trackStuck", () => {
        assert.equal(shouldApplicationSkipOnTrackStuck(), false)
    })
})

describe("playWouldSendNullEncoded", () => {
    it("is true for Queue metadata with encoded empty string", () => {
        assert.equal(playWouldSendNullEncoded({ encoded: "" }), true)
    })

    it("is true for missing encoded", () => {
        assert.equal(playWouldSendNullEncoded({}), true)
        assert.equal(playWouldSendNullEncoded(null), true)
    })

    it("is false for a real Lavalink encoded track", () => {
        assert.equal(playWouldSendNullEncoded({ encoded: "QAAB..." }), false)
    })
})

describe("armTrackStuckPlayPrepare", () => {
    it("plays immediately when the post-stuck head is already companion-ready", async () => {
        const player = stuckPlayer(readyHttp("ready"))
        armTrackStuckPlayPrepare(player, () => player)
        await player.play({ track: ytMeta(VIDEO_A), noReplace: false })
        assert.deepEqual(player.playCalls, [{ noReplace: false }])
    })

    it('hydrates YouTube metadata then plays so encoded:"" never reaches the node', async () => {
        const meta = ytMeta(VIDEO_A)
        assert.equal(playWouldSendNullEncoded(meta), true)
        assert.equal(isYoutubePlaybackReady(meta), false)

        const player = stuckPlayer(meta)
        armTrackStuckPlayPrepare(player, () => player, configWithFetch(companionOkFetch()))
        await player.play({ track: meta, noReplace: false })

        assert.equal(isYoutubePlaybackReady(player.queue.current as Track), true)
        assert.equal(playWouldSendNullEncoded(player.queue.current as Track), false)
        assert.deepEqual(player.playCalls, [{ noReplace: false }])
    })

    it('does not play encoded:"" when prepare stays deferred (avoids null-stop double-skip)', async () => {
        const meta = ytMeta(VIDEO_A)
        const player = stuckPlayer(meta)
        armTrackStuckPlayPrepare(player, () => player, {
            origin: COMPANION_ORIGIN,
            secretKey: "changemechangeme",
            fetchImpl: async () => {
                throw new Error("fetch failed")
            },
            sleep: async () => undefined,
        })

        await player.play({ track: meta, noReplace: false })

        assert.equal(player.playCalls.length, 0)
        assert.equal(player.repeatMode, "off")
        assert.equal(player.queue.current, meta)
    })
})
