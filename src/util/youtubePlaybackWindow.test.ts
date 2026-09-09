import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import type { CompanionFetch, CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { skipCurrentTrack } from "./skipCurrentTrack.js"
import {
    ensureCurrentPlayable,
    ensurePrefetchWindow,
    ensureUpcomingHeadPlayable,
    isCompanionRetryUsed,
    isPermanentYoutubePlaybackFailure,
    isPlaylistLoadType,
    isYoutubePlaybackReady,
    markCompanionRetryUsed,
    PREFETCH_UPCOMING_COUNT,
    queueMetadataTrackFromFields,
    queueTrackIdentity,
    retryCompanionPlaybackOnce,
} from "./youtubePlaybackWindow.js"
import { isCompanionResolvedTrack } from "./youtubeCompanionPlayback.js"

const VIDEO_A = "dQw4w9WgXcQ"
const VIDEO_B = "abcdefghijk"
const VIDEO_C = "lmnopqrstuv"
const VIDEO_D = "wxyzABCDEFG"
const COMPANION_ORIGIN = "http://invidious-companion:8282"

function youtubeTrack(videoId: string, title = videoId): Track {
    return {
        encoded: `yt-${videoId}`,
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
    } as unknown as Track
}

function httpReadyTrack(id: string): Track {
    return {
        encoded: `http-${id}`,
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
        requester: "user-1",
    } as unknown as Track
}

function companionOkFetch(): CompanionFetch {
    return async (url, init) => {
        if (init?.method === "POST") {
            const body = JSON.parse(String(init.body ?? "{}")) as { videoId?: string }
            const videoId = body.videoId ?? VIDEO_A
            return jsonResponse({
                playabilityStatus: { status: "OK" },
                streamingData: {
                    adaptiveFormats: [{ itag: 251, mimeType: "audio/webm; codecs=opus" }],
                },
            })
        }
        const id = new URL(url).searchParams.get("id") ?? VIDEO_A
        return redirectResponse(`/companion/videoplayback?id=${id}`)
    }
}

function companionUnplayableFetch(): CompanionFetch {
    return async (_url, init) => {
        if (init?.method === "POST") {
            return jsonResponse({
                playabilityStatus: { status: "UNPLAYABLE", reason: "Private video" },
            })
        }
        return new Response("no", { status: 404 })
    }
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    })
}

function redirectResponse(location: string, status = 302): Response {
    return new Response(null, { status, headers: { Location: location } })
}

function configWithFetch(fetchImpl: CompanionFetch): CompanionPlaybackConfig {
    return {
        origin: COMPANION_ORIGIN,
        secretKey: "changemechangeme",
        fetchImpl,
        sleep: async () => undefined,
    }
}

function mockWindowPlayer(
    guildId: string,
    upcoming: Track[],
    current: Track | null = null
): Player {
    const tracks = [...upcoming]
    let currentRef = current
    return {
        guildId,
        playing: Boolean(current),
        queue: {
            get current() {
                return currentRef
            },
            set current(value: Track | null) {
                currentRef = value
            },
            tracks,
            add(items: Track | Track[]) {
                const list = Array.isArray(items) ? items : [items]
                tracks.push(...list)
            },
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                const flat = insert.flat()
                return tracks.splice(start, deleteCount, ...flat)
            },
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
        async play() {
            return undefined
        },
    } as unknown as Player
}

describe("playlist load type + metadata helpers", () => {
    it("treats playlist and PLAYLIST_LOADED as playlist loads", () => {
        assert.equal(isPlaylistLoadType("playlist"), true)
        assert.equal(isPlaylistLoadType("PLAYLIST_LOADED"), true)
        assert.equal(isPlaylistLoadType("track"), false)
        assert.equal(isPlaylistLoadType("search"), false)
    })

    it("builds Queue metadata from stored fields and denies private hosts", () => {
        const yt = queueMetadataTrackFromFields({
            title: "Rick",
            author: "Astley",
            uri: `https://www.youtube.com/watch?v=${VIDEO_A}`,
            duration: 213000,
        })
        assert.ok(yt)
        assert.equal(yt.info.sourceName, "youtube")
        assert.equal(yt.info.isrc, null)
        assert.equal(isYoutubePlaybackReady(yt), false)
        const withIsrc = queueMetadataTrackFromFields({
            title: "Worth it",
            author: "Outr3ach",
            uri: "https://open.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn",
            duration: 259000,
            isrc: "USRC17600001",
        })
        assert.equal(withIsrc?.info.isrc, "USRC17600001")
        const httpMeta = queueMetadataTrackFromFields({
            title: "File",
            author: "Host",
            uri: "https://example.com/track.mp3",
            duration: 1000,
        })
        assert.ok(httpMeta)
        assert.equal(httpMeta.info.sourceName, "http")
        assert.equal(httpMeta.encoded, "")
        assert.equal(isYoutubePlaybackReady(httpMeta), false)
        assert.equal(isYoutubePlaybackReady(httpReadyTrack("native")), true)
        assert.equal(
            queueMetadataTrackFromFields({
                title: "x",
                author: "y",
                uri: "http://10.0.0.5/a.mp3",
                duration: 1,
            }),
            null
        )
    })

    it("classifies companion playability misses as permanent", () => {
        assert.equal(
            isPermanentYoutubePlaybackFailure(
                new Error("invidious-companion cannot play dQw4w9WgXcQ: Private video")
            ),
            true
        )
        assert.equal(
            isPermanentYoutubePlaybackFailure(new Error("No YouTube search result for track")),
            true
        )
        assert.equal(
            isPermanentYoutubePlaybackFailure(
                new Error("Spotify catalog track has no ISRC or title")
            ),
            true
        )
        assert.equal(
            isPermanentYoutubePlaybackFailure(new Error("invidious-companion player failed (503)")),
            false
        )
        assert.equal(isPermanentYoutubePlaybackFailure(new Error("fetch failed")), false)
    })

    it("normalizes queue track identity for case and trailing slashes", () => {
        const a = youtubeTrack(VIDEO_A)
        a.info.uri = `HTTPS://www.YouTube.com/watch?v=${VIDEO_A}/`
        const b = youtubeTrack(VIDEO_A)
        b.info.uri = `https://www.youtube.com/watch?v=${VIDEO_A}`
        assert.equal(queueTrackIdentity(a), queueTrackIdentity(b))
        assert.equal(
            queueTrackIdentity(youtubeTrack(VIDEO_B)),
            `https://www.youtube.com/watch?v=${VIDEO_B}`
        )
    })

    it("builds Queue metadata with Unknown defaults for blank titles", () => {
        const track = queueMetadataTrackFromFields({
            title: "  ",
            author: "",
            uri: "https://open.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn",
            duration: 1000,
        })
        assert.ok(track)
        assert.equal(track.info.title, "Unknown")
        assert.equal(track.info.author, "Unknown")
        assert.equal(track.info.sourceName, "spotify")
        assert.equal(track.info.identifier, "4hqIKGKzDVJXCnD80y2fyn")
        assert.equal(isYoutubePlaybackReady(track), false)
    })
})

describe("ensureCurrentPlayable + prefetch window", () => {
    it("leaves native sources ready without companion", async () => {
        const player = mockWindowPlayer("g1", [httpReadyTrack("a")], httpReadyTrack("now"))
        const result = await ensureCurrentPlayable(
            () => player,
            "g1",
            configWithFetch(companionOkFetch())
        )
        assert.equal(result, "ok")
        assert.equal(isYoutubePlaybackReady(player.queue.current as Track), true)
    })

    it("hydrates HTTP Queue metadata via Lavalink search before play", async () => {
        const meta = queueMetadataTrackFromFields({
            title: "File",
            author: "Host",
            uri: "https://example.com/track.mp3",
            duration: 1000,
            requesterId: "user-restore",
        })
        assert.ok(meta)
        assert.equal(isYoutubePlaybackReady(meta), false)
        const player = mockWindowPlayer("g-http-meta", [], meta)
        const result = await ensureCurrentPlayable(
            () => player,
            "g-http-meta",
            configWithFetch(companionOkFetch())
        )
        assert.equal(result, "ok")
        const current = player.queue.current as Track
        assert.ok(current)
        assert.equal(isYoutubePlaybackReady(current), true)
        assert.ok(typeof current.encoded === "string" && current.encoded.length > 0)
        assert.equal(current.requester, "user-restore")
    })

    it("skips HTTP metadata when Lavalink search returns nothing", async () => {
        const meta = queueMetadataTrackFromFields({
            title: "Missing",
            author: "Host",
            uri: "https://example.com/gone.mp3",
            duration: 1000,
        })
        assert.ok(meta)
        const player = mockWindowPlayer("g-http-miss", [], meta)
        player.search = async () => ({ tracks: [] }) as never
        const result = await ensureCurrentPlayable(
            () => player,
            "g-http-miss",
            configWithFetch(companionOkFetch())
        )
        assert.equal(result, "empty")
        assert.equal(player.queue.current, null)
    })

    it("skips permanently unplayable head items and starts the next playable", async () => {
        const player = mockWindowPlayer(
            "g-skip-head",
            [youtubeTrack(VIDEO_B, "ok")],
            youtubeTrack(VIDEO_A, "bad")
        )
        const fetchImpl: CompanionFetch = async (url, init) => {
            if (init?.method === "POST") {
                const body = JSON.parse(String(init.body ?? "{}")) as { videoId?: string }
                if (body.videoId === VIDEO_A) {
                    return jsonResponse({
                        playabilityStatus: { status: "UNPLAYABLE", reason: "Private video" },
                    })
                }
            }
            return companionOkFetch()(url, init)
        }
        const result = await ensureCurrentPlayable(
            () => player,
            "g-skip-head",
            configWithFetch(fetchImpl)
        )
        assert.equal(result, "ok")
        assert.equal(player.queue.current, null)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
        assert.equal(player.queue.tracks[0]?.info.identifier, VIDEO_B)
    })

    it("defers when companion fails transiently and keeps Queue metadata", async () => {
        const player = mockWindowPlayer("g-defer", [], youtubeTrack(VIDEO_A))
        const result = await ensureCurrentPlayable(
            () => player,
            "g-defer",
            configWithFetch(async () => {
                throw new Error("fetch failed")
            })
        )
        assert.equal(result, "deferred")
        assert.equal(player.queue.current?.info.identifier, VIDEO_A)
        assert.equal(isCompanionResolvedTrack(player.queue.current as Track), false)
    })

    it("re-prepares when current is replaced during companion resolve", async () => {
        const player = mockWindowPlayer("g-race-current", [], youtubeTrack(VIDEO_A, "first"))
        let sawFirstPlayerPost = false
        const fetchImpl: CompanionFetch = async (url, init) => {
            if (init?.method === "POST") {
                const body = JSON.parse(String(init.body ?? "{}")) as { videoId?: string }
                if (body.videoId === VIDEO_A && !sawFirstPlayerPost) {
                    sawFirstPlayerPost = true
                    // Simulate skip/play-next replacing the head while prepare is in flight.
                    player.queue.current = youtubeTrack(VIDEO_B, "successor")
                }
            }
            return companionOkFetch()(url, init)
        }
        const result = await ensureCurrentPlayable(
            () => player,
            "g-race-current",
            configWithFetch(fetchImpl)
        )
        assert.equal(result, "ok")
        assert.equal(player.queue.current?.info.identifier, VIDEO_B)
        assert.equal(isCompanionResolvedTrack(player.queue.current as Track), true)
        assert.equal(isYoutubePlaybackReady(player.queue.current as Track), true)
    })

    it("prepares current plus the next two upcoming tracks only", async () => {
        assert.equal(PREFETCH_UPCOMING_COUNT, 2)
        const player = mockWindowPlayer(
            "g-window",
            [youtubeTrack(VIDEO_B), youtubeTrack(VIDEO_C), youtubeTrack(VIDEO_D)],
            youtubeTrack(VIDEO_A)
        )
        const result = await ensurePrefetchWindow(
            () => player,
            "g-window",
            configWithFetch(companionOkFetch())
        )
        assert.equal(result, "ok")
        assert.equal(isCompanionResolvedTrack(player.queue.current as Track), true)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[1] as Track), true)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[2] as Track), false)
        assert.equal(player.queue.tracks.length, 3)
    })

    it("prepares upcoming[0] when current is empty", async () => {
        const player = mockWindowPlayer("g-empty-cur", [youtubeTrack(VIDEO_A)], null)
        const result = await ensureCurrentPlayable(
            () => player,
            "g-empty-cur",
            configWithFetch(companionOkFetch())
        )
        assert.equal(result, "ok")
        assert.equal(player.queue.current, null)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
        assert.equal(player.queue.tracks[0]?.info.identifier, VIDEO_A)
    })

    it("skips permanently unplayable upcoming[0] when current is empty", async () => {
        const player = mockWindowPlayer(
            "g-skip-upcoming",
            [youtubeTrack(VIDEO_A, "bad"), youtubeTrack(VIDEO_B, "ok")],
            null
        )
        const fetchImpl: CompanionFetch = async (url, init) => {
            if (init?.method === "POST") {
                const body = JSON.parse(String(init.body ?? "{}")) as { videoId?: string }
                if (body.videoId === VIDEO_A) {
                    return jsonResponse({
                        playabilityStatus: { status: "UNPLAYABLE", reason: "Private video" },
                    })
                }
            }
            return companionOkFetch()(url, init)
        }
        const result = await ensureCurrentPlayable(
            () => player,
            "g-skip-upcoming",
            configWithFetch(fetchImpl)
        )
        assert.equal(result, "ok")
        assert.equal(player.queue.tracks.length, 1)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
        assert.equal(player.queue.tracks[0]?.info.identifier, VIDEO_B)
    })

    it("returns empty when every upcoming metadata item is permanently unplayable", async () => {
        const player = mockWindowPlayer(
            "g-all-bad",
            [youtubeTrack(VIDEO_A), youtubeTrack(VIDEO_B)],
            null
        )
        const result = await ensureCurrentPlayable(
            () => player,
            "g-all-bad",
            configWithFetch(companionUnplayableFetch())
        )
        assert.equal(result, "empty")
        assert.equal(player.queue.tracks.length, 0)
    })

    it("defers prefetch when an upcoming slot fails transiently", async () => {
        const player = mockWindowPlayer(
            "g-pref-def",
            [youtubeTrack(VIDEO_A)],
            httpReadyTrack("now")
        )
        const result = await ensurePrefetchWindow(
            () => player,
            "g-pref-def",
            configWithFetch(async () => {
                throw new Error("fetch failed")
            })
        )
        assert.equal(result, "deferred")
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), false)
        assert.equal(player.queue.tracks[0]?.info.identifier, VIDEO_A)
    })

    it("returns no_player when the live player is gone", async () => {
        assert.equal(
            await ensureCurrentPlayable(
                () => undefined,
                "g-gone",
                configWithFetch(companionOkFetch())
            ),
            "no_player"
        )
        const wrongGuild = mockWindowPlayer("other", [], youtubeTrack(VIDEO_A))
        assert.equal(
            await ensureCurrentPlayable(
                () => wrongGuild,
                "g-expected",
                configWithFetch(companionOkFetch())
            ),
            "no_player"
        )
    })
})

describe("playback window identity races", () => {
    it("does not stamp a resolved current onto a replaced head", async () => {
        const player = mockWindowPlayer("g-race-cur", [], youtubeTrack(VIDEO_A))
        const fetchImpl: CompanionFetch = async (url, init) => {
            // Successor / skip replaced the head while companion prepare was in flight.
            player.queue.current = youtubeTrack(VIDEO_B)
            return companionOkFetch()(url, init)
        }
        const result = await ensureCurrentPlayable(
            () => player,
            "g-race-cur",
            configWithFetch(fetchImpl)
        )
        assert.equal(result, "ok")
        assert.equal(player.queue.current?.info.identifier, VIDEO_B)
        assert.equal(isCompanionResolvedTrack(player.queue.current as Track), true)
    })

    it("does not splice a resolved upcoming onto a replaced slot", async () => {
        const player = mockWindowPlayer("g-race-up", [youtubeTrack(VIDEO_A)], httpReadyTrack("now"))
        const fetchImpl: CompanionFetch = async (url, init) => {
            player.queue.tracks[0] = youtubeTrack(VIDEO_B)
            return companionOkFetch()(url, init)
        }
        const result = await ensureUpcomingHeadPlayable(
            () => player,
            "g-race-up",
            configWithFetch(fetchImpl)
        )
        assert.equal(result, "ok")
        assert.equal(player.queue.tracks[0]?.info.identifier, VIDEO_B)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
    })

    it("does not drop a replaced unplayable head during permanent failure", async () => {
        const player = mockWindowPlayer("g-race-drop", [], youtubeTrack(VIDEO_A))
        const fetchImpl: CompanionFetch = async (url, init) => {
            if (init?.method === "POST") {
                const body = JSON.parse(String(init.body ?? "{}")) as { videoId?: string }
                if (body.videoId === VIDEO_A) {
                    // Concurrent skip/play replaced A with B before the permanent miss applied.
                    player.queue.current = youtubeTrack(VIDEO_B)
                    return jsonResponse({
                        playabilityStatus: { status: "UNPLAYABLE", reason: "Private video" },
                    })
                }
            }
            return companionOkFetch()(url, init)
        }
        const result = await ensureCurrentPlayable(
            () => player,
            "g-race-drop",
            configWithFetch(fetchImpl)
        )
        // Failed prepare for A must not clear successor B; B then prepares successfully.
        assert.equal(result, "ok")
        assert.equal(player.queue.current?.info.identifier, VIDEO_B)
        assert.equal(isCompanionResolvedTrack(player.queue.current as Track), true)
    })
})

describe("skip upcoming + companion retry", () => {
    it("resolves upcoming head before skip", async () => {
        const player = mockWindowPlayer("g-skip", [youtubeTrack(VIDEO_A)])
        const result = await ensureUpcomingHeadPlayable(
            () => player,
            "g-skip",
            configWithFetch(companionOkFetch())
        )
        assert.equal(result, "ok")
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
    })

    it("re-prepares upcoming[0] when shuffle replaces it during resolve", async () => {
        const player = mockWindowPlayer("g-race-upcoming", [
            youtubeTrack(VIDEO_A, "first"),
            youtubeTrack(VIDEO_B, "second"),
        ])
        let sawFirstPlayerPost = false
        const fetchImpl: CompanionFetch = async (url, init) => {
            if (init?.method === "POST") {
                const body = JSON.parse(String(init.body ?? "{}")) as { videoId?: string }
                if (body.videoId === VIDEO_A && !sawFirstPlayerPost) {
                    sawFirstPlayerPost = true
                    // Shuffle moved a different unresolved track into upcoming[0].
                    await player.queue.splice(0, 1)
                }
            }
            return companionOkFetch()(url, init)
        }
        const result = await ensureUpcomingHeadPlayable(
            () => player,
            "g-race-upcoming",
            configWithFetch(fetchImpl)
        )
        assert.equal(result, "ok")
        assert.equal(player.queue.tracks[0]?.info.identifier, VIDEO_B)
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
    })

    it("skipCurrentTrack prepares a YouTube metadata head before skip()", async () => {
        const skipCalls: number[] = []
        const player = mockWindowPlayer("g-skip-gate", [youtubeTrack(VIDEO_A)])
        const skipPlayer = {
            ...player,
            skip: async () => {
                skipCalls.push(1)
            },
        }
        await skipCurrentTrack(skipPlayer, configWithFetch(companionOkFetch()))
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
        assert.deepEqual(skipCalls, [1])
    })

    it("refills the prefetch window after upcoming tracks are reordered", async () => {
        const player = mockWindowPlayer(
            "g-shuffle",
            [youtubeTrack(VIDEO_B), youtubeTrack(VIDEO_C), youtubeTrack(VIDEO_D)],
            youtubeTrack(VIDEO_A)
        )
        const config = configWithFetch(companionOkFetch())
        const first = await ensurePrefetchWindow(() => player, "g-shuffle", config)
        assert.equal(first, "ok")
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[2] as Track), false)

        const [moved] = player.queue.tracks.splice(2, 1)
        player.queue.tracks.unshift(moved as Track)

        const afterShuffle = await ensurePrefetchWindow(() => player, "g-shuffle", config)
        assert.equal(afterShuffle, "ok")
        assert.equal(isCompanionResolvedTrack(player.queue.tracks[0] as Track), true)
        assert.equal(player.queue.tracks[0]?.info.identifier, VIDEO_D)
    })

    it("retries a companion HTTP track once then skips", async () => {
        const current = youtubeTrack(VIDEO_A)
        ;(current as { userData?: Record<string, unknown> }).userData = {
            invidiousCompanionResolved: true,
        }
        const player = mockWindowPlayer("g-retry", [], current)
        const first = await retryCompanionPlaybackOnce(
            () => player,
            "g-retry",
            current,
            configWithFetch(companionOkFetch())
        )
        assert.equal(first, "retried")
        assert.equal(isCompanionRetryUsed(current), true)

        const second = await retryCompanionPlaybackOnce(
            () => player,
            "g-retry",
            current,
            configWithFetch(companionOkFetch())
        )
        assert.equal(second, "skip")
    })

    it("skips companion retry when live current no longer matches the failed track", async () => {
        const failed = youtubeTrack(VIDEO_A)
        ;(failed as { userData?: Record<string, unknown> }).userData = {
            invidiousCompanionResolved: true,
        }
        const player = mockWindowPlayer("g-retry-mismatch", [], youtubeTrack(VIDEO_B))
        const result = await retryCompanionPlaybackOnce(
            () => player,
            "g-retry-mismatch",
            failed,
            configWithFetch(companionOkFetch())
        )
        assert.equal(result, "skip")
        assert.equal(isCompanionRetryUsed(failed), true)
        assert.equal(player.queue.current?.info.identifier, VIDEO_B)
        assert.equal(isCompanionResolvedTrack(player.queue.current as Track), false)
    })

    it("marks retry used without affecting a fresh track", () => {
        const track = youtubeTrack(VIDEO_A)
        assert.equal(isCompanionRetryUsed(track), false)
        markCompanionRetryUsed(track)
        assert.equal(isCompanionRetryUsed(track), true)
    })
})
