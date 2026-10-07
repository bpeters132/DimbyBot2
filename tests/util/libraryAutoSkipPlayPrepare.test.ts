import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import type {
    CompanionFetch,
    CompanionPlaybackConfig,
} from "../../src/util/youtubeCompanionPlayback.js"
import {
    armLibraryAutoSkipPlayPrepare,
    playWouldSendNullEncoded,
} from "../../src/util/libraryAutoSkipPlayPrepare.js"
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

describe("armLibraryAutoSkipPlayPrepare", () => {
    it("no-ops when current is already playback-ready", async () => {
        const player = makePlayer(youtubeReady(VIDEO_A))
        const before = player.play
        armLibraryAutoSkipPlayPrepare(player, () => player)
        assert.equal(player.play, before)
        await player.play({ noReplace: true })
        assert.deepEqual(player.playCalls, [{ noReplace: true }])
    })

    it("hydrates an unprepared YouTube head before the library autoSkip play", async () => {
        const player = makePlayer(youtubeMetadata(VIDEO_A))
        assert.equal(isYoutubePlaybackReady(player.queue.current!), false)
        armLibraryAutoSkipPlayPrepare(player, () => player, configWith(companionOkFetch()))
        await player.play({ noReplace: true })
        assert.equal(isYoutubePlaybackReady(player.queue.current!), true)
        assert.equal(playWouldSendNullEncoded(player.queue.current), false)
        assert.deepEqual(player.playCalls, [{ noReplace: true }])
    })

    it('does not play encoded:"" when companion prepare stays deferred', async () => {
        const player = makePlayer(youtubeMetadata(VIDEO_A), [youtubeMetadata(VIDEO_B)])
        armLibraryAutoSkipPlayPrepare(player, () => player, configWith(companionDeferredFetch()))
        await player.play({ noReplace: true })
        assert.deepEqual(player.playCalls, [])
        assert.equal(player.queue.current?.info?.identifier, VIDEO_A)
        assert.equal(player.queue.tracks.length, 1)
        assert.equal(isYoutubePlaybackReady(player.queue.current!), false)
    })

    it("does not wrap a successor player's play after destroy/replace", async () => {
        const zombie = makePlayer(youtubeMetadata(VIDEO_A))
        const live = makePlayer(youtubeReady(VIDEO_B))
        armLibraryAutoSkipPlayPrepare(zombie, () => live, configWith(companionOkFetch()))
        await zombie.play({ noReplace: true })
        assert.deepEqual(zombie.playCalls, [{ noReplace: true }])
        assert.equal(isYoutubePlaybackReady(zombie.queue.current!), false)
    })
})
