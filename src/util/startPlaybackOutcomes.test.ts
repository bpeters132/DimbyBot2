import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import type { CompanionFetch, CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { startPlaybackIfNeeded } from "./musicManager.js"

const VIDEO_A = "dQw4w9WgXcQ"
const COMPANION_ORIGIN = "http://invidious-companion:8282"

function nativeTrack(id: string): Track {
    return {
        encoded: `enc-${id}`,
        info: {
            title: id,
            author: "Artist",
            uri: `https://soundcloud.com/${id}`,
            duration: 1000,
            isStream: false,
            identifier: id,
            isSeekable: true,
            sourceName: "soundcloud",
            artworkUrl: null,
            isrc: null,
        },
        requester: undefined,
    } as unknown as Track
}

function youtubeMetadata(videoId: string): Track {
    return {
        encoded: "",
        info: {
            title: videoId,
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
        requester: undefined,
        userData: { queueMetadata: true },
    } as unknown as Track
}

function mockPlayer(opts: {
    guildId?: string
    playing?: boolean
    current?: Track | null
    tracks?: Track[]
}): Player & { playCalls: number } {
    const tracks = opts.tracks ? [...opts.tracks] : []
    let current = opts.current === undefined ? null : opts.current
    const player = {
        guildId: opts.guildId ?? "guild-start-outcomes",
        playing: opts.playing ?? false,
        playCalls: 0,
        queue: {
            get current() {
                return current
            },
            set current(value: Track | null) {
                current = value
            },
            tracks,
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                return tracks.splice(start, deleteCount, ...insert.flat())
            },
        },
        async play() {
            player.playCalls += 1
            player.playing = true
        },
        search: async () => ({ tracks: [] }),
    }
    return player as unknown as Player & { playCalls: number }
}

function configWithFetch(fetchImpl: CompanionFetch): CompanionPlaybackConfig {
    return {
        origin: COMPANION_ORIGIN,
        secretKey: "changemechangeme",
        fetchImpl,
        sleep: async () => undefined,
    }
}

describe("startPlaybackIfNeeded prepare outcomes", () => {
    it("returns empty and does not play when the queue has no tracks", async () => {
        const player = mockPlayer({ playing: false, current: null, tracks: [] })
        const result = await startPlaybackIfNeeded(player)
        assert.equal(result, "empty")
        assert.equal(player.playCalls, 0)
    })

    it("returns ok and starts play for a native-ready current track", async () => {
        const player = mockPlayer({
            playing: false,
            current: nativeTrack("now"),
            tracks: [],
        })
        const result = await startPlaybackIfNeeded(player)
        assert.equal(result, "ok")
        assert.equal(player.playCalls, 1)
        assert.equal(player.playing, true)
    })

    it("returns ok without calling play when already playing", async () => {
        const player = mockPlayer({
            playing: true,
            current: nativeTrack("now"),
        })
        const result = await startPlaybackIfNeeded(player)
        assert.equal(result, "ok")
        assert.equal(player.playCalls, 0)
    })

    it("returns deferred and does not play when YouTube prepare fails transiently", async () => {
        const player = mockPlayer({
            playing: false,
            current: youtubeMetadata(VIDEO_A),
            tracks: [],
        })
        const result = await startPlaybackIfNeeded(
            player,
            configWithFetch(async () => {
                throw new Error("fetch failed")
            })
        )
        assert.equal(result, "deferred")
        assert.equal(player.playCalls, 0)
        assert.equal(player.playing, false)
        assert.equal(player.queue.current?.info.identifier, VIDEO_A)
        assert.equal(player.queue.current?.encoded, "")
    })

    it("returns empty after permanently unplayable heads are dropped", async () => {
        const player = mockPlayer({
            playing: false,
            current: youtubeMetadata(VIDEO_A),
            tracks: [],
        })
        const result = await startPlaybackIfNeeded(
            player,
            configWithFetch(async (_url, init) => {
                if (init?.method === "POST") {
                    return new Response(
                        JSON.stringify({
                            playabilityStatus: { status: "UNPLAYABLE", reason: "Private video" },
                        }),
                        { status: 200, headers: { "Content-Type": "application/json" } }
                    )
                }
                return new Response("no", { status: 404 })
            })
        )
        assert.equal(result, "empty")
        assert.equal(player.playCalls, 0)
        assert.equal(player.queue.current, null)
    })
})
