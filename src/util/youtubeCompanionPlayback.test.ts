import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    COMPANION_FETCH_TIMEOUT_MS,
    catalogYoutubeSearchQueries,
    companionLatestVersionPath,
    ensureCompanionOriginStreamUrl,
    applyPlaybackDuration,
    companionLengthMsFromPlayerJson,
    overlayCatalogIdentity,
    overlayYoutubeMetadata,
    pickPreferredAudioItag,
    PREFERRED_AUDIO_ITAGS,
    resolveCompanionRedirectUrl,
    resolveYoutubePlaybackTrack,
    resolveYoutubePlaybackTracks,
    youtubeVideoIdFromTrack,
    youtubeVideoIdFromUri,
    type CompanionFetch,
    type CompanionPlaybackConfig,
} from "./youtubeCompanionPlayback.js"

const VIDEO_ID = "dQw4w9WgXcQ"
const COMPANION_ORIGIN = "http://invidious-companion:8282"

function youtubeTrack(overrides: Partial<Track["info"]> = {}): Track {
    return {
        encoded: "yt-encoded",
        info: {
            title: "Never Gonna Give You Up",
            author: "Rick Astley",
            uri: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
            duration: 213000,
            isStream: false,
            identifier: VIDEO_ID,
            isSeekable: true,
            sourceName: "youtube",
            artworkUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
            isrc: null,
            ...overrides,
        },
        requester: "user-1",
    } as unknown as Track
}

function soundcloudTrack(): Track {
    return youtubeTrack({
        sourceName: "soundcloud",
        identifier: "sc-123",
        uri: "https://soundcloud.com/artist/track",
        title: "SC Track",
        author: "SC Artist",
    })
}

function spotifyTrack(overrides: Partial<Track["info"]> = {}): Track {
    return youtubeTrack({
        sourceName: "spotify",
        identifier: "4hqIKGKzDVJXCnD80y2fyn",
        uri: "https://open.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn",
        title: "Worth it",
        author: "Outr3ach",
        artworkUrl: "https://i.scdn.co/image/ab",
        isrc: "USRC17600001",
        duration: 259000,
        ...overrides,
    })
}

function companionOkFetch(): CompanionFetch {
    const streamPath = companionLatestVersionPath(VIDEO_ID, 251)
    return async (url, init) => {
        if (init?.method === "POST") {
            return jsonResponse({
                playabilityStatus: { status: "OK" },
                streamingData: {
                    adaptiveFormats: [
                        { itag: 140, mimeType: "audio/mp4" },
                        { itag: 251, mimeType: "audio/webm; codecs=opus" },
                    ],
                },
            })
        }
        assert.equal(new URL(url).pathname + new URL(url).search, streamPath)
        return redirectResponse(`/companion/videoplayback?id=${VIDEO_ID}`)
    }
}

function httpTrackFromSearch(): Track {
    return {
        encoded: "http-encoded",
        info: {
            title: "unknown",
            author: "unknown",
            uri: `${COMPANION_ORIGIN}/companion/videoplayback?id=${VIDEO_ID}`,
            duration: 0,
            isStream: true,
            identifier: "http-id",
            isSeekable: false,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
        },
        requester: undefined,
    } as unknown as Track
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

function mockPlayer(searchImpl?: (query: string) => Promise<{ tracks: Track[] }>): Player {
    return {
        search: async (query: string) => {
            if (!searchImpl) throw new Error("search not stubbed")
            return searchImpl(query)
        },
    } as unknown as Player
}

function configWithFetch(
    fetchImpl: CompanionFetch,
    sleepMs: number[] = [],
    logger?: CompanionPlaybackConfig["logger"]
): CompanionPlaybackConfig {
    return {
        origin: COMPANION_ORIGIN,
        secretKey: "changemechangeme",
        fetchImpl,
        sleep: async (ms) => {
            sleepMs.push(ms)
        },
        logger,
    }
}

function recordingLogger(): {
    lines: Array<{ level: string; message: string }>
    logger: NonNullable<CompanionPlaybackConfig["logger"]>
} {
    const lines: Array<{ level: string; message: string }> = []
    return {
        lines,
        logger: {
            debug: (text: string) => lines.push({ level: "debug", message: text }),
            info: (text: string) => lines.push({ level: "info", message: text }),
            warn: (text: string) => lines.push({ level: "warn", message: text }),
            error: (text: string) => lines.push({ level: "error", message: text }),
        },
    }
}

describe("youtube companion itag + URL helpers", () => {
    it("prefers Opus 251 then AAC 140", () => {
        assert.equal(PREFERRED_AUDIO_ITAGS[0], 251)
        assert.equal(
            pickPreferredAudioItag([
                { itag: 140, mimeType: "audio/mp4" },
                { itag: 251, mimeType: "audio/webm" },
            ]),
            251
        )
        assert.equal(pickPreferredAudioItag([{ itag: 140, mimeType: "audio/mp4" }]), 140)
    })

    it("reads snake_case adaptive_formats and falls back to audio mimeType", () => {
        assert.equal(
            pickPreferredAudioItag([
                { itag: 18, mime_type: "video/mp4" },
                { itag: 251, mime_type: "audio/webm" },
            ]),
            251
        )
        assert.equal(pickPreferredAudioItag([{ itag: 139, mimeType: "audio/mp4" }]), 139)
        assert.equal(pickPreferredAudioItag([{ itag: 18, mimeType: "video/mp4" }]), null)
    })

    it("extracts video ids from identifier and common YouTube URLs", () => {
        assert.equal(youtubeVideoIdFromTrack(youtubeTrack()), VIDEO_ID)
        assert.equal(youtubeVideoIdFromUri(`https://youtu.be/${VIDEO_ID}`), VIDEO_ID)
        assert.equal(youtubeVideoIdFromUri(`https://www.youtube.com/embed/${VIDEO_ID}`), VIDEO_ID)
        assert.equal(youtubeVideoIdFromUri(`https://www.youtube.com/shorts/${VIDEO_ID}`), VIDEO_ID)
        assert.equal(youtubeVideoIdFromUri("https://example.com/watch?v=dQw4w9WgXcQ"), null)
        assert.equal(
            youtubeVideoIdFromTrack({
                ...youtubeTrack(),
                info: {
                    ...youtubeTrack().info,
                    sourceName: "spotify",
                    identifier: "spotify:track:abc",
                },
            } as Track),
            null
        )
    })

    it("rewrites relative and localhost companion redirects onto the companion origin", () => {
        const relative = resolveCompanionRedirectUrl(
            `/companion/videoplayback?id=${VIDEO_ID}&host=rr.googlevideo.com`,
            COMPANION_ORIGIN
        )
        assert.equal(
            relative,
            `${COMPANION_ORIGIN}/companion/videoplayback?id=${VIDEO_ID}&host=rr.googlevideo.com`
        )
        const local = resolveCompanionRedirectUrl(
            `http://127.0.0.1:8282/companion/videoplayback?id=${VIDEO_ID}`,
            COMPANION_ORIGIN
        )
        assert.equal(local, `${COMPANION_ORIGIN}/companion/videoplayback?id=${VIDEO_ID}`)
    })

    it("rewrites googlevideo URLs onto companion videoplayback", () => {
        const proxied = ensureCompanionOriginStreamUrl(
            "https://rr4---sn-abc.googlevideo.com/videoplayback?expire=1&id=abc",
            COMPANION_ORIGIN
        )
        const parsed = new URL(proxied)
        assert.equal(parsed.origin, COMPANION_ORIGIN)
        assert.equal(parsed.pathname, "/companion/videoplayback")
        assert.equal(parsed.searchParams.get("host"), "rr4---sn-abc.googlevideo.com")
        assert.equal(parsed.searchParams.get("expire"), "1")
        assert.equal(
            ensureCompanionOriginStreamUrl(
                `${COMPANION_ORIGIN}/companion/videoplayback?id=${VIDEO_ID}`,
                COMPANION_ORIGIN
            ),
            `${COMPANION_ORIGIN}/companion/videoplayback?id=${VIDEO_ID}`
        )
        assert.throws(
            () =>
                ensureCompanionOriginStreamUrl("https://evil.example/audio.mp3", COMPANION_ORIGIN),
            {
                message: /Refusing to play non-companion HTTP URL/,
            }
        )
    })

    it("copies YouTube metadata onto the HTTP track without replacing Playback duration", () => {
        const yt = youtubeTrack({ duration: 213000 })
        const http = httpTrackFromSearch()
        http.info.duration = 300000
        http.info.isStream = false
        overlayYoutubeMetadata(http, yt)
        assert.equal(http.info.title, yt.info.title)
        assert.equal(http.info.author, yt.info.author)
        assert.equal(http.info.uri, yt.info.uri)
        assert.equal(http.info.identifier, VIDEO_ID)
        assert.equal(http.info.sourceName, "youtube")
        assert.equal(http.info.artworkUrl, yt.info.artworkUrl)
        assert.equal(http.info.duration, 300000)
        assert.equal(http.requester, "user-1")
        assert.equal(http.encoded, "http-encoded")
        assert.equal(
            (http as { userData?: { invidiousCompanionResolved?: boolean } }).userData
                ?.invidiousCompanionResolved,
            true
        )
        assert.equal(
            (http as { userData?: { companionErrorRetryUsed?: boolean } }).userData
                ?.companionErrorRetryUsed,
            undefined
        )
    })

    it("overlays Spotify catalog identity onto the companion HTTP track", () => {
        const catalog = spotifyTrack()
        const http = httpTrackFromSearch()
        http.info.duration = 300000
        const overlaid = overlayCatalogIdentity(
            overlayYoutubeMetadata(http, youtubeTrack({ duration: 213000 })),
            catalog
        )
        assert.equal(overlaid.info.title, "Worth it")
        assert.equal(overlaid.info.author, "Outr3ach")
        assert.equal(overlaid.info.uri, `https://www.youtube.com/watch?v=${VIDEO_ID}`)
        assert.equal(overlaid.info.identifier, catalog.info.identifier)
        assert.equal(overlaid.info.sourceName, "spotify")
        assert.equal(overlaid.info.isrc, "USRC17600001")
        assert.equal(overlaid.info.duration, 300000)
        assert.equal(overlaid.encoded, "http-encoded")
        assert.equal(
            (overlaid as { userData?: { invidiousCompanionResolved?: boolean } }).userData
                ?.invidiousCompanionResolved,
            true
        )
    })

    it("does not copy companionErrorRetryUsed onto a freshly minted HTTP track", () => {
        const yt = youtubeTrack()
        ;(yt as { userData?: Record<string, unknown> }).userData = {
            companionErrorRetryUsed: true,
            queueMetadata: true,
        }
        const http = httpTrackFromSearch()
        overlayYoutubeMetadata(http, yt)
        const youtubeData = (http as { userData?: Record<string, unknown> }).userData
        assert.equal(youtubeData?.invidiousCompanionResolved, true)
        assert.equal(youtubeData?.companionErrorRetryUsed, undefined)
        assert.equal(youtubeData?.queueMetadata, true)

        const catalog = spotifyTrack()
        ;(catalog as { userData?: Record<string, unknown> }).userData = {
            companionErrorRetryUsed: true,
        }
        overlayCatalogIdentity(http, catalog)
        const catalogData = (http as { userData?: Record<string, unknown> }).userData
        assert.equal(catalogData?.invidiousCompanionResolved, true)
        assert.equal(catalogData?.companionErrorRetryUsed, undefined)
    })

    it("stamps Playback duration from HTTP, then companion length, then YouTube search", () => {
        assert.equal(
            companionLengthMsFromPlayerJson({ videoDetails: { lengthSeconds: "300" } }),
            300000
        )
        assert.equal(
            companionLengthMsFromPlayerJson({ video_details: { length_seconds: 250 } }),
            250000
        )
        assert.equal(companionLengthMsFromPlayerJson({}), null)

        const httpReady = httpTrackFromSearch()
        httpReady.info.duration = 400000
        applyPlaybackDuration(httpReady, {
            companionLengthMs: 300000,
            youtubeSearchDurationMs: 213000,
        })
        assert.equal(httpReady.info.duration, 400000)
        assert.equal(httpReady.info.isStream, false)

        const httpCompanion = httpTrackFromSearch()
        applyPlaybackDuration(httpCompanion, {
            companionLengthMs: 300000,
            youtubeSearchDurationMs: 213000,
        })
        assert.equal(httpCompanion.info.duration, 300000)
        assert.equal(httpCompanion.info.isStream, false)

        const httpYoutube = httpTrackFromSearch()
        applyPlaybackDuration(httpYoutube, {
            companionLengthMs: null,
            youtubeSearchDurationMs: 213000,
        })
        assert.equal(httpYoutube.info.duration, 213000)
        assert.equal(httpYoutube.info.isStream, false)
    })

    it("builds LavaSrc-style catalog YouTube search queries", () => {
        assert.deepEqual(catalogYoutubeSearchQueries(spotifyTrack()), [
            'ytsearch:"USRC17600001"',
            "ytsearch:Worth it Outr3ach",
        ])
        assert.deepEqual(catalogYoutubeSearchQueries(spotifyTrack({ isrc: null })), [
            "ytsearch:Worth it Outr3ach",
        ])
    })
})

describe("resolveYoutubePlaybackTrack", () => {
    it("returns SoundCloud tracks unchanged without calling companion", async () => {
        let fetched = false
        const sc = soundcloudTrack()
        const result = await resolveYoutubePlaybackTrack(
            mockPlayer(),
            sc,
            configWithFetch(async () => {
                fetched = true
                return jsonResponse({})
            })
        )
        assert.equal(result, sc)
        assert.equal(fetched, false)
    })

    it("warns then throws when companion config is missing", async () => {
        const rec = recordingLogger()
        await assert.rejects(
            () =>
                resolveYoutubePlaybackTrack(mockPlayer(), youtubeTrack(), {
                    origin: COMPANION_ORIGIN,
                    secretKey: "",
                    logger: rec.logger,
                }),
            { message: /INVIDIOUS_COMPANION/ }
        )
        assert.ok(
            rec.lines.some(
                (line) => line.level === "warn" && line.message.includes("[YoutubeCompanion]")
            )
        )
        assert.equal(
            rec.lines.some(
                (line) => /https?:\/\//.test(line.message) && line.message.includes("Bearer")
            ),
            false
        )
    })

    it("throws when companion config is missing", async () => {
        await assert.rejects(
            () => resolveYoutubePlaybackTrack(mockPlayer(), youtubeTrack(), null),
            {
                message: /INVIDIOUS_COMPANION/,
            }
        )
    })

    it("throws when playability is not OK", async () => {
        const rec = recordingLogger()
        await assert.rejects(
            () =>
                resolveYoutubePlaybackTrack(
                    mockPlayer(),
                    youtubeTrack(),
                    configWithFetch(
                        async () =>
                            jsonResponse({
                                playabilityStatus: {
                                    status: "UNPLAYABLE",
                                    reason: "This video is private",
                                },
                            }),
                        [],
                        rec.logger
                    )
                ),
            { message: /This video is private/ }
        )
        assert.ok(
            rec.lines.some(
                (line) =>
                    line.level === "warn" &&
                    line.message.includes("[YoutubeCompanion]") &&
                    line.message.includes(VIDEO_ID)
            )
        )
    })

    it("retries 503 then plays the companion-proxied HTTP stream", async () => {
        const sleeps: number[] = []
        const rec = recordingLogger()
        let playerPosts = 0
        const streamPath = companionLatestVersionPath(VIDEO_ID, 251)
        const companionStream = `${COMPANION_ORIGIN}/companion/videoplayback?id=${VIDEO_ID}`
        const searched: string[] = []
        const player = mockPlayer(async (query) => {
            searched.push(query)
            return { tracks: [httpTrackFromSearch()] }
        })
        const result = await resolveYoutubePlaybackTrack(
            player,
            youtubeTrack(),
            configWithFetch(
                async (url, init) => {
                    if (init?.method === "POST") {
                        playerPosts += 1
                        if (playerPosts === 1) {
                            return new Response("TOKEN_MINTER_NOT_READY", { status: 503 })
                        }
                        return jsonResponse({
                            playabilityStatus: { status: "OK" },
                            streamingData: {
                                adaptiveFormats: [
                                    { itag: 140, mimeType: "audio/mp4" },
                                    { itag: 251, mimeType: "audio/webm; codecs=opus" },
                                ],
                            },
                        })
                    }
                    assert.equal(new URL(url).pathname + new URL(url).search, streamPath)
                    assert.equal(init?.redirect, "manual")
                    return redirectResponse(`/companion/videoplayback?id=${VIDEO_ID}`)
                },
                sleeps,
                rec.logger
            )
        )
        assert.equal(playerPosts, 2)
        assert.deepEqual(sleeps, [1500])
        assert.deepEqual(searched, [companionStream])
        assert.equal(result.info.title, "Never Gonna Give You Up")
        assert.equal(result.info.sourceName, "youtube")
        assert.equal(result.info.identifier, VIDEO_ID)
        assert.equal((result as Track).encoded, "http-encoded")
        assert.ok(
            rec.lines.some((line) => line.level === "debug" && line.message.includes("503 retry"))
        )
        assert.ok(
            rec.lines.some(
                (line) => line.level === "debug" && line.message.includes(`resolved ${VIDEO_ID}`)
            )
        )
        for (const line of rec.lines) {
            assert.equal(line.message.includes("changemechangeme"), false)
            assert.equal(line.message.includes("Bearer"), false)
            assert.equal(line.message.includes("videoplayback"), false)
        }
    })

    it("retries companion fetches that abort on the per-attempt timeout", async () => {
        let attempts = 0
        const rec = recordingLogger()
        const sleeps: number[] = []
        const cfg = configWithFetch(
            async (_url, init): Promise<Response> => {
                attempts += 1
                const signal = init?.signal
                if (!signal) throw new Error("expected AbortSignal")
                await new Promise<never>((_, reject) => {
                    const fail = (): void => {
                        const err = new Error("Aborted")
                        err.name = "TimeoutError"
                        reject(err)
                    }
                    if (signal.aborted) fail()
                    else signal.addEventListener("abort", fail, { once: true })
                })
                throw new Error("expected abort")
            },
            sleeps,
            rec.logger
        )
        cfg.fetchTimeoutMs = 20
        await assert.rejects(
            () => resolveYoutubePlaybackTrack(mockPlayer(), youtubeTrack(), cfg),
            (err: unknown) => err instanceof Error && err.name === "TimeoutError"
        )
        assert.equal(COMPANION_FETCH_TIMEOUT_MS, 10_000)
        assert.equal(attempts, 4)
        assert.deepEqual(sleeps, [1500, 3000, 4500])
        assert.ok(
            rec.lines.some(
                (line) => line.level === "debug" && line.message.includes("timeout retry")
            )
        )
    })

    it("uses companion lengthSeconds when Lavalink HTTP duration is 0", async () => {
        const player = mockPlayer(async () => ({ tracks: [httpTrackFromSearch()] }))
        const result = await resolveYoutubePlaybackTrack(
            player,
            youtubeTrack({ duration: 213000 }),
            configWithFetch(async (url, init) => {
                if (init?.method === "POST") {
                    return jsonResponse({
                        playabilityStatus: { status: "OK" },
                        videoDetails: { lengthSeconds: "300" },
                        streamingData: {
                            adaptiveFormats: [{ itag: 251, mimeType: "audio/webm; codecs=opus" }],
                        },
                    })
                }
                return companionOkFetch()(url, init)
            })
        )
        assert.equal(result.info.duration, 300000)
        assert.equal(result.info.isStream, false)
    })

    it("falls back to YouTube search duration when HTTP and companion length are missing", async () => {
        const player = mockPlayer(async () => ({ tracks: [httpTrackFromSearch()] }))
        const result = await resolveYoutubePlaybackTrack(
            player,
            youtubeTrack({ duration: 213000 }),
            configWithFetch(companionOkFetch())
        )
        assert.equal(result.info.duration, 213000)
        assert.equal(result.info.isStream, false)
    })

    it("does not re-resolve a track already proxied through companion", async () => {
        let fetched = false
        const already = overlayYoutubeMetadata(httpTrackFromSearch(), youtubeTrack())
        const result = await resolveYoutubePlaybackTrack(
            mockPlayer(),
            already,
            configWithFetch(async () => {
                fetched = true
                return jsonResponse({})
            })
        )
        assert.equal(result, already)
        assert.equal(fetched, false)
    })
})

describe("Spotify catalog → YouTube search → companion", () => {
    it("YouTube-searches ISRC first then overlays Spotify identity", async () => {
        const searched: string[] = []
        const catalog = spotifyTrack()
        const player = mockPlayer(async (query) => {
            searched.push(query)
            if (query.startsWith("ytsearch:")) {
                return { tracks: [youtubeTrack()] }
            }
            return { tracks: [httpTrackFromSearch()] }
        })
        const result = await resolveYoutubePlaybackTrack(
            player,
            catalog,
            configWithFetch(companionOkFetch())
        )
        assert.equal(searched[0], 'ytsearch:"USRC17600001"')
        assert.equal(result.info.sourceName, "spotify")
        assert.equal(result.info.uri, `https://www.youtube.com/watch?v=${VIDEO_ID}`)
        assert.equal(result.info.identifier, catalog.info.identifier)
        assert.equal(result.info.title, "Worth it")
        assert.equal(result.info.duration, 213000)
        assert.equal((result as Track).encoded, "http-encoded")
        assert.equal(
            (result as { userData?: { invidiousCompanionResolved?: boolean } }).userData
                ?.invidiousCompanionResolved,
            true
        )
        assert.equal(
            searched.some((q) => q.startsWith("http://invidious-companion")),
            true
        )
    })

    it("falls back to title/author ytsearch when there is no ISRC", async () => {
        const searched: string[] = []
        const catalog = spotifyTrack({ isrc: null })
        const player = mockPlayer(async (query) => {
            searched.push(query)
            if (query.startsWith("ytsearch:")) {
                return { tracks: [youtubeTrack()] }
            }
            return { tracks: [httpTrackFromSearch()] }
        })
        await resolveYoutubePlaybackTrack(player, catalog, configWithFetch(companionOkFetch()))
        assert.equal(searched[0], "ytsearch:Worth it Outr3ach")
        assert.equal(
            searched.some((q) => q.includes("USRC")),
            false
        )
    })

    it("throws when both YouTube searches miss and never plays the Spotify encoded track", async () => {
        let fetched = false
        const catalog = spotifyTrack()
        const rec = recordingLogger()
        const player = mockPlayer(async (query) => {
            assert.equal(query.startsWith("ytsearch:"), true)
            return { tracks: [] }
        })
        await assert.rejects(
            () =>
                resolveYoutubePlaybackTrack(
                    player,
                    catalog,
                    configWithFetch(
                        async () => {
                            fetched = true
                            return jsonResponse({})
                        },
                        [],
                        rec.logger
                    )
                ),
            { message: /No YouTube search result for Spotify catalog track/ }
        )
        assert.equal(fetched, false)
        assert.ok(
            rec.lines.some(
                (line) =>
                    line.level === "warn" && line.message.includes("catalog YouTube search miss")
            )
        )
    })

    it("skips unplayable catalog tracks in a playlist batch", async () => {
        const miss = spotifyTrack({ identifier: "miss-id", isrc: "MISS00000000", title: "Miss" })
        const hit = spotifyTrack({ identifier: "hit-id", isrc: "HIT000000000" })
        const player = mockPlayer(async (query) => {
            if (query.includes("MISS00000000")) return { tracks: [] }
            if (query.includes("HIT000000000") || query.startsWith("ytsearch:Worth")) {
                return { tracks: [youtubeTrack()] }
            }
            if (query.startsWith("http://invidious-companion")) {
                return { tracks: [httpTrackFromSearch()] }
            }
            return { tracks: [] }
        })
        const rec = recordingLogger()
        const result = await resolveYoutubePlaybackTracks(
            player,
            [miss, hit],
            configWithFetch(companionOkFetch(), [], rec.logger)
        )
        assert.equal(result.length, 1)
        assert.equal(result[0]?.info.identifier, "hit-id")
        assert.equal(result[0]?.info.sourceName, "spotify")
        assert.ok(rec.lines.some((line) => line.message.includes("skipping unplayable track")))
    })
})
