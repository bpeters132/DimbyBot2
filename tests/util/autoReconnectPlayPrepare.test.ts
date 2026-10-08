import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import type {
    CompanionFetch,
    CompanionPlaybackConfig,
} from "../../src/util/youtubeCompanionPlayback.js"
import {
    armAutoReconnectPlayPrepare,
    playWouldSendNullEncoded,
} from "../../src/util/autoReconnectPlayPrepare.js"
import { isYoutubePlaybackReady } from "../../src/util/youtubePlaybackWindow.js"

const VIDEO_A = "dQw4w9WgXcQ"
const VIDEO_B = "abcdefghijk"
const COMPANION_ORIGIN = "http://invidious-companion:8282"

function youtubeMetadata(videoId: string, title = videoId): Track {
    return {
        encoded: "",
        info: {
            title,
            author: "Artist",
            uri: `https://www.youtube.com/watch?v=${videoId}`,
            duration: 1000,
            isStream: false,
            identifier: videoId,
            isSeekable: true,
            sourceName: "youtube",
            artworkUrl: null,
            isrc: null,
        },
        requester: "user-1",
        userData: { queueMetadata: true },
    } as unknown as Track
}

function youtubeReady(videoId: string): Track {
    return {
        ...youtubeMetadata(videoId),
        encoded: `yt-${videoId}`,
        userData: { invidiousCompanionResolved: true },
    } as unknown as Track
}

function companionOkFetch(): CompanionFetch {
    return async (url, init) => {
        if (init?.method === "POST") {
            return new Response(
                JSON.stringify({
                    playabilityStatus: { status: "OK" },
                    streamingData: {
                        adaptiveFormats: [{ itag: 251, mimeType: "audio/webm; codecs=opus" }],
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            )
        }
        const id = new URL(url).searchParams.get("id") ?? VIDEO_A
        return new Response(null, {
            status: 302,
            headers: { Location: `/companion/videoplayback?id=${id}` },
        })
    }
}

function companionDeferredFetch(): CompanionFetch {
    return async () => {
        throw new Error("fetch failed: ECONNRESET")
    }
}

function makePlayer(
    current: Track | null,
    tracks: Track[] = []
): Player & {
    playCalls: unknown[]
} {
    const bag = new Map<string, unknown>()
    const playCalls: unknown[] = []
    const upcoming = [...tracks]
    let currentRef = current
    const player = {
        guildId: "guild-1",
        playCalls,
        queue: {
            get current() {
                return currentRef
            },
            set current(value: Track | null) {
                currentRef = value
            },
            tracks: upcoming,
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                const flat = insert.flat()
                return upcoming.splice(start, deleteCount, ...flat)
            },
        },
        get: (key: string) => bag.get(key),
        set: (key: string, value: unknown) => {
            bag.set(key, value)
        },
        search: async (query: string) => {
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
            playCalls.push(options ?? {})
            return player
        },
    }
    return player as unknown as Player & { playCalls: unknown[] }
}

function configWith(fetchImpl: CompanionFetch): CompanionPlaybackConfig {
    return {
        origin: COMPANION_ORIGIN,
        secretKey: "changemechangeme",
        fetchImpl,
        sleep: async () => undefined,
    }
}

describe("playWouldSendNullEncoded", () => {
    it("is true for missing track, empty encoded, and non-string encoded", () => {
        assert.equal(playWouldSendNullEncoded(null), true)
        assert.equal(playWouldSendNullEncoded(undefined), true)
        assert.equal(playWouldSendNullEncoded({ encoded: "" }), true)
        assert.equal(playWouldSendNullEncoded({ encoded: 1 }), true)
    })

    it("is false for a non-empty encoded string", () => {
        assert.equal(playWouldSendNullEncoded({ encoded: "abc" }), false)
    })
})

describe("armAutoReconnectPlayPrepare", () => {
    it("no-ops when current is already playback-ready", async () => {
        const player = makePlayer(youtubeReady(VIDEO_A))
        const before = player.play
        armAutoReconnectPlayPrepare(player, () => player)
        assert.equal(player.play, before)
        await player.play({ position: 12_000, paused: false, clientTrack: player.queue.current })
        assert.deepEqual(player.playCalls, [
            { position: 12_000, paused: false, clientTrack: player.queue.current },
        ])
    })

    it("no-ops when current is empty and upcoming[0] is already playback-ready", async () => {
        const player = makePlayer(null, [youtubeReady(VIDEO_A)])
        const before = player.play
        armAutoReconnectPlayPrepare(player, () => player)
        assert.equal(player.play, before)
    })

    it("hydrates an unprepared YouTube current before autoReconnect play", async () => {
        const stale = youtubeMetadata(VIDEO_A)
        const player = makePlayer(stale)
        assert.equal(isYoutubePlaybackReady(player.queue.current!), false)
        armAutoReconnectPlayPrepare(player, () => player, configWith(companionOkFetch()))
        await player.play({ position: 0, paused: false, clientTrack: stale })
        assert.equal(isYoutubePlaybackReady(player.queue.current!), true)
        assert.equal(playWouldSendNullEncoded(player.queue.current), false)
        assert.equal(player.playCalls.length, 1)
        const played = player.playCalls[0] as { clientTrack?: Track; position?: number }
        assert.equal(played.position, 0)
        assert.equal(played.clientTrack, player.queue.current)
        assert.equal(playWouldSendNullEncoded(played.clientTrack), false)
    })

    it("hydrates upcoming[0] when current is empty before autoReconnect play", async () => {
        const player = makePlayer(null, [youtubeMetadata(VIDEO_A)])
        armAutoReconnectPlayPrepare(player, () => player, configWith(companionOkFetch()))
        await player.play({ paused: false })
        assert.equal(player.queue.current, null)
        assert.equal(isYoutubePlaybackReady(player.queue.tracks[0]!), true)
        assert.deepEqual(player.playCalls, [{ paused: false }])
    })

    it('does not play encoded:"" when companion prepare stays deferred', async () => {
        const stale = youtubeMetadata(VIDEO_A)
        const player = makePlayer(stale, [youtubeMetadata(VIDEO_B)])
        armAutoReconnectPlayPrepare(player, () => player, configWith(companionDeferredFetch()))
        await player.play({ position: 5_000, paused: false, clientTrack: stale })
        assert.deepEqual(player.playCalls, [])
        assert.equal(player.queue.current?.info?.identifier, VIDEO_A)
        assert.equal(player.queue.tracks.length, 1)
        assert.equal(isYoutubePlaybackReady(player.queue.current!), false)
    })

    it("does not wrap a successor player's play after destroy/replace", async () => {
        const zombie = makePlayer(youtubeMetadata(VIDEO_A))
        const live = makePlayer(youtubeReady(VIDEO_B))
        armAutoReconnectPlayPrepare(zombie, () => live, configWith(companionOkFetch()))
        await zombie.play({ position: 0, paused: false, clientTrack: zombie.queue.current })
        assert.equal(zombie.playCalls.length, 1)
        assert.equal(isYoutubePlaybackReady(zombie.queue.current!), false)
    })
})
