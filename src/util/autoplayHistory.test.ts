import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track, TrackInfo } from "lavalink-client"
import {
    AUTOPLAY_RECENT_SONG_CAP,
    autoplaySameComposition,
    autoplayTrackFingerprint,
    clearAutoplayRecent,
    isAutoplayRecentlyPlayed,
    isDuplicateAutoplayCandidate,
    isPlausibleAutoplayMusicTrack,
    isSamePrimaryArtist,
    matchesCatalogCandidate,
    normalizeAutoplayComparable,
    orderLavalinkTracksForAutoplay,
    orderSimilarByArtistVariety,
    primaryArtistKey,
    rememberAutoplayPlayed,
    seedAutoplayHistoryFromPlayer,
    songIdentityKey,
    titlesLikelySameSong,
    toggleAutoplay,
    youtubeVideoIdFromUri,
    canonicalSongCore,
    coreTrackTitle,
} from "./autoplayHistory.js"

function info(overrides: Partial<TrackInfo> = {}): TrackInfo {
    return {
        title: "Song Title",
        author: "Artist",
        uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        duration: 180_000,
        isStream: false,
        identifier: "dQw4w9WgXcQ",
        isSeekable: true,
        sourceName: "youtube",
        artworkUrl: null,
        isrc: null,
        ...overrides,
    } as TrackInfo
}

function mockPlayer(): Player {
    const store = new Map<string, unknown>()
    return {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => {
            store.set(key, value)
        },
        queue: { current: null, tracks: [], previous: [] },
    } as unknown as Player
}

function trackFromInfo(trackInfo: TrackInfo): Track {
    return { info: trackInfo, encoded: "enc", requester: null } as unknown as Track
}

describe("youtubeVideoIdFromUri", () => {
    it("parses watch, short, embed, shorts, and live URLs", () => {
        assert.equal(
            youtubeVideoIdFromUri("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )
        assert.equal(youtubeVideoIdFromUri("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ")
        assert.equal(
            youtubeVideoIdFromUri("https://www.youtube.com/embed/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )
        assert.equal(
            youtubeVideoIdFromUri("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
            "dQw4w9WgXcQ"
        )
        assert.equal(
            youtubeVideoIdFromUri("https://music.youtube.com/watch?v=abc123XYZ01"),
            "abc123XYZ01"
        )
    })

    it("returns null for missing, non-YouTube, or malformed URIs", () => {
        assert.equal(youtubeVideoIdFromUri(undefined), null)
        assert.equal(youtubeVideoIdFromUri("https://open.spotify.com/track/x"), null)
        assert.equal(youtubeVideoIdFromUri("not a url"), null)
    })
})

describe("title and artist normalization", () => {
    it("strips promo trailers and feat. tails for comparable cores", () => {
        assert.equal(coreTrackTitle("Hello (Official Music Video)"), "hello")
        assert.equal(primaryArtistKey("Adele feat. Someone"), "adele")
        assert.equal(canonicalSongCore("Adele", "Adele - Hello (Lyrics)"), "hello")
        assert.equal(isSamePrimaryArtist("Adele ft. X", "Adele"), true)
        assert.equal(isSamePrimaryArtist("Adele", "Beyonce"), false)
    })

    it("normalizes diacritics, brackets, and punctuation for comparison", () => {
        assert.equal(normalizeAutoplayComparable("Café (Live)"), "cafe")
        assert.equal(normalizeAutoplayComparable("Song [Remix]!!!"), "song")
        assert.equal(normalizeAutoplayComparable("  Multi   Space  "), "multi space")
        assert.equal(normalizeAutoplayComparable(undefined), "")
    })
})

describe("titlesLikelySameSong", () => {
    it("matches long same-artist titles after promo noise is stripped", () => {
        assert.equal(
            titlesLikelySameSong(
                "Someone Like You",
                "Someone Like You (Official Music Video)",
                "Adele",
                "Adele"
            ),
            true
        )
        assert.equal(
            titlesLikelySameSong(
                "Rolling in the Deep",
                "Adele - Rolling in the Deep Lyrics",
                "Adele",
                "Adele Topic"
            ),
            true
        )
    })

    it("rejects different works even when artists match", () => {
        assert.equal(titlesLikelySameSong("Someone Like You", "Hello", "Adele", "Adele"), false)
        assert.equal(titlesLikelySameSong("Creep", "Karma Police", "Radiohead", "Radiohead"), false)
    })

    it("rejects similar short titles across incompatible artists", () => {
        assert.equal(titlesLikelySameSong("Run", "Run", "Artist A", "Artist B"), false)
        assert.equal(
            titlesLikelySameSong(
                "Totally Different Long Title Alpha",
                "Completely Other Long Title Beta",
                "Band One",
                "Band Two"
            ),
            false
        )
    })
})

describe("matchesCatalogCandidate", () => {
    it("fails closed on missing hit or blank catalog rows", () => {
        assert.equal(
            matchesCatalogCandidate(undefined, "Adele", "Hello", "Adele", undefined),
            false
        )
        assert.equal(matchesCatalogCandidate(info(), "", "Hello", "Adele", undefined), false)
        assert.equal(matchesCatalogCandidate(info(), "Adele", "  ", "Adele", undefined), false)
    })

    it("accepts Lavalink hits that match the catalog composition", () => {
        assert.equal(
            matchesCatalogCandidate(
                info({ author: "Adele", title: "Hello (Lyrics)" }),
                "Adele",
                "Hello",
                "seed-unused",
                undefined
            ),
            true
        )
    })

    it("rejects unrelated search top-hits for a catalog query", () => {
        assert.equal(
            matchesCatalogCandidate(
                info({ author: "Random Channel", title: "Completely Unrelated Upload Name" }),
                "Adele",
                "Hello",
                "Adele",
                undefined
            ),
            false
        )
    })

    it("matches via ended-track alternate spelling when catalog equals the seed work", () => {
        const catalogArtist = "Adele"
        const catalogTitle = "Hello There Friends Forever Zebra"
        const ended = info({
            author: "Adele",
            title: "Hello There Friends Forever Yonder Remix Version Extra Words Here",
        })
        const candidate = info({
            author: "Adele",
            title: "Yonder Remix Version Extra Words Here",
        })
        assert.equal(
            matchesCatalogCandidate(candidate, catalogArtist, catalogTitle, "unused", undefined),
            false
        )
        assert.equal(
            matchesCatalogCandidate(candidate, catalogArtist, catalogTitle, "unused", ended),
            true
        )
    })
})

describe("toggleAutoplay", () => {
    it("seeds recent history when enabling and clears it when disabling", () => {
        const store = new Map<string, unknown>()
        const player = {
            get: (key: string) => store.get(key),
            set: (key: string, value: unknown) => {
                store.set(key, value)
            },
            queue: {
                current: trackFromInfo(info({ author: "Seed", title: "Now Playing" })),
                tracks: [],
                previous: [trackFromInfo(info({ author: "Earlier", title: "Previous Track" }))],
            },
        } as unknown as Player

        assert.equal(toggleAutoplay(player), true)
        assert.equal(player.get("autoplay"), true)
        assert.equal(
            isAutoplayRecentlyPlayed(player, info({ author: "Seed", title: "Now Playing" })),
            true
        )
        assert.equal(
            isAutoplayRecentlyPlayed(player, info({ author: "Earlier", title: "Previous Track" })),
            true
        )

        assert.equal(toggleAutoplay(player), false)
        assert.equal(player.get("autoplay"), false)
        assert.equal(
            isAutoplayRecentlyPlayed(player, info({ author: "Seed", title: "Now Playing" })),
            false
        )
    })
})

describe("seedAutoplayHistoryFromPlayer", () => {
    it("seeds previous[0] as most-recent prior, then current on top; drops oldest when over cap", () => {
        const store = new Map<string, unknown>()
        const player = {
            get: (key: string) => store.get(key),
            set: (key: string, value: unknown) => {
                store.set(key, value)
            },
            queue: {
                // Lavalink: previous[0] is the track that just ended (most recent prior).
                previous: [
                    trackFromInfo(info({ author: "B", title: "Just Ended", identifier: "id-mid" })),
                    trackFromInfo(info({ author: "A", title: "Older", identifier: "id-old" })),
                ],
                current: trackFromInfo(
                    info({ author: "C", title: "Current", identifier: "id-cur" })
                ),
                tracks: [],
            },
        } as unknown as Player

        seedAutoplayHistoryFromPlayer(player)

        assert.equal(isAutoplayRecentlyPlayed(player, info({ author: "A", title: "Older" })), true)
        assert.equal(
            isAutoplayRecentlyPlayed(player, info({ author: "B", title: "Just Ended" })),
            true
        )
        assert.equal(
            isAutoplayRecentlyPlayed(player, info({ author: "C", title: "Current" })),
            true
        )

        // Cap+current: reverse-walk previous then unshift current so oldest prior is evicted.
        const overflowPrev = Array.from({ length: AUTOPLAY_RECENT_SONG_CAP }, (_, i) =>
            trackFromInfo(
                info({
                    author: `Prev${i}`,
                    title: `Track${i}`,
                    identifier: `id${String(i).padStart(9, "0")}`,
                    uri: `https://www.youtube.com/watch?v=${String(i).padStart(11, "0")}`,
                })
            )
        )
        store.clear()
        const capped = {
            get: (key: string) => store.get(key),
            set: (key: string, value: unknown) => {
                store.set(key, value)
            },
            queue: {
                previous: overflowPrev,
                current: trackFromInfo(
                    info({
                        author: "Keep",
                        title: "Now",
                        identifier: "keepnow0000",
                        uri: "https://www.youtube.com/watch?v=keepnow0000",
                    })
                ),
                tracks: [],
            },
        } as unknown as Player
        seedAutoplayHistoryFromPlayer(capped)

        assert.equal(
            isAutoplayRecentlyPlayed(
                capped,
                info({
                    author: "Keep",
                    title: "Now",
                    identifier: "keepnow0000",
                    uri: "https://www.youtube.com/watch?v=keepnow0000",
                })
            ),
            true
        )
        // previous[0] (most recent prior) survives under the cap.
        assert.equal(
            isAutoplayRecentlyPlayed(
                capped,
                info({
                    author: "Prev0",
                    title: "Track0",
                    identifier: "id000000000",
                    uri: "https://www.youtube.com/watch?v=00000000000",
                })
            ),
            true
        )
        // previous[CAP-1] (oldest prior) is evicted when current pushes over the cap.
        const last = AUTOPLAY_RECENT_SONG_CAP - 1
        assert.equal(
            isAutoplayRecentlyPlayed(
                capped,
                info({
                    author: `Prev${last}`,
                    title: `Track${last}`,
                    identifier: `id${String(last).padStart(9, "0")}`,
                    uri: `https://www.youtube.com/watch?v=${String(last).padStart(11, "0")}`,
                })
            ),
            false
        )
    })

    it("tolerates missing previous/current without writing history", () => {
        const store = new Map<string, unknown>()
        const player = {
            get: (key: string) => store.get(key),
            set: (key: string, value: unknown) => {
                store.set(key, value)
            },
            queue: { previous: [], current: null, tracks: [] },
        } as unknown as Player

        seedAutoplayHistoryFromPlayer(player)
        assert.deepEqual(player.get("autoplayRecentSongs") ?? [], [])
    })
})

describe("isPlausibleAutoplayMusicTrack", () => {
    it("rejects reaction/interview junk and very short non-stream clips", () => {
        assert.equal(
            isPlausibleAutoplayMusicTrack(info({ title: "Producer Reacts to New Song" })),
            false
        )
        assert.equal(
            isPlausibleAutoplayMusicTrack(info({ title: "Exclusive Interview with the Band" })),
            false
        )
        assert.equal(
            isPlausibleAutoplayMusicTrack(info({ title: "Real Song", duration: 15_000 })),
            false
        )
        assert.equal(isPlausibleAutoplayMusicTrack(info({ title: "Real Song" })), true)
        assert.equal(isPlausibleAutoplayMusicTrack(undefined), false)
    })
})

describe("autoplaySameComposition / duplicates", () => {
    it("matches covers and lyric uploads of the same work", () => {
        assert.equal(
            autoplaySameComposition("Radiohead", "Creep", "Radiohead", "Creep Lyrics"),
            true
        )
        assert.equal(
            autoplaySameComposition(
                "Radiohead",
                "Creep",
                "Some Cover Channel",
                "Radiohead - Creep (Cover)"
            ),
            false
        )
    })

    it("does not treat unrelated short titles as the same song across artists", () => {
        assert.equal(autoplaySameComposition("Artist A", "Run", "Artist B", "Run"), false)
        assert.equal(autoplaySameComposition("Artist A", "Run", "Artist A", "Run"), true)
    })

    it("detects duplicates by URI, YouTube id, and composition", () => {
        const ended = info({
            uri: "https://www.youtube.com/watch?v=abc123XYZ01",
            identifier: "abc123XYZ01",
            author: "Adele",
            title: "Hello",
        })
        assert.equal(
            isDuplicateAutoplayCandidate(
                info({
                    uri: "https://youtu.be/abc123XYZ01",
                    identifier: "other",
                    author: "Adele",
                    title: "Hello Official Video",
                }),
                ended
            ),
            true
        )
        assert.equal(
            isDuplicateAutoplayCandidate(
                info({
                    uri: "https://www.youtube.com/watch?v=zzzzzzzzzzz",
                    identifier: "zzzzzzzzzzz",
                    author: "Other",
                    title: "Totally Different Song Name Here",
                }),
                ended
            ),
            false
        )
    })
})

describe("fingerprints and recent history", () => {
    it("prefers YouTube id fingerprints and falls back to song identity", () => {
        assert.equal(
            autoplayTrackFingerprint(info({ uri: "https://youtu.be/dQw4w9WgXcQ" })),
            "yt:dQw4w9WgXcQ"
        )
        assert.equal(
            autoplayTrackFingerprint(
                info({
                    uri: "https://open.spotify.com/track/x",
                    identifier: "",
                    author: "Adele",
                    title: "Hello",
                })
            ),
            songIdentityKey("Adele", "Hello")
        )
    })

    it("remembers distinct songs, caps history, and matches fuzzy recent plays", () => {
        const player = mockPlayer()
        rememberAutoplayPlayed(player, info({ author: "Adele", title: "Hello" }))
        rememberAutoplayPlayed(player, info({ author: "Adele", title: "Hello (Lyrics)" }))
        assert.equal(
            isAutoplayRecentlyPlayed(
                player,
                info({ author: "Adele", title: "Hello Official Audio" })
            ),
            true
        )
        assert.equal(
            isAutoplayRecentlyPlayed(player, info({ author: "Beyonce", title: "Halo" })),
            false
        )

        for (let i = 0; i < AUTOPLAY_RECENT_SONG_CAP + 5; i++) {
            rememberAutoplayPlayed(player, info({ author: `Artist${i}`, title: `Song ${i}` }))
        }
        const recent = player.get("autoplayRecentSongs") as string[]
        assert.equal(recent.length, AUTOPLAY_RECENT_SONG_CAP)
        assert.equal(
            isAutoplayRecentlyPlayed(player, info({ author: "Adele", title: "Hello" })),
            false
        )

        clearAutoplayRecent(player)
        assert.equal(
            isAutoplayRecentlyPlayed(
                player,
                info({
                    author: `Artist${AUTOPLAY_RECENT_SONG_CAP + 4}`,
                    title: `Song ${AUTOPLAY_RECENT_SONG_CAP + 4}`,
                })
            ),
            false
        )
    })
})

describe("ordering helpers", () => {
    it("orders similar recommendations with other artists first", () => {
        const ordered = orderSimilarByArtistVariety(
            [
                { artist: "Adele", title: "Someone Like You" },
                { artist: "Sam Smith", title: "Stay With Me" },
                { artist: "Adele ft. X", title: "Rumour Has It" },
            ],
            "Adele"
        )
        assert.deepEqual(
            ordered.map((s) => s.artist),
            ["Sam Smith", "Adele", "Adele ft. X"]
        )
    })

    it("filters junk, duplicates, and recent plays when ordering Lavalink hits", () => {
        const player = mockPlayer()
        const ended = info({
            author: "Seed",
            title: "Ended Track",
            identifier: "ended1",
            uri: "https://www.youtube.com/watch?v=endedTrack01",
        })
        rememberAutoplayPlayed(
            player,
            info({
                author: "Recent",
                title: "Already Heard",
                identifier: "recent1",
                uri: "https://www.youtube.com/watch?v=recentHeard01",
            })
        )

        const tracks = [
            trackFromInfo(
                info({
                    author: "Other Band",
                    title: "Fresh Cut",
                    identifier: "a1",
                    uri: "https://www.youtube.com/watch?v=freshCutAAAA",
                })
            ),
            trackFromInfo(
                info({
                    author: "Seed",
                    title: "Ended Track",
                    identifier: "ended1",
                    uri: ended.uri,
                })
            ),
            trackFromInfo(
                info({
                    author: "Recent",
                    title: "Already Heard",
                    identifier: "r1",
                    uri: "https://www.youtube.com/watch?v=recentHeard02",
                })
            ),
            trackFromInfo(
                info({
                    author: "Clip Channel",
                    title: "Producer Reacts to Hit",
                    identifier: "j1",
                    uri: "https://www.youtube.com/watch?v=junkReact0001",
                })
            ),
            trackFromInfo(
                info({
                    author: "Seed",
                    title: "Same Artist B-Side",
                    identifier: "s1",
                    uri: "https://www.youtube.com/watch?v=sameArtistB01",
                })
            ),
        ]

        const ordered = orderLavalinkTracksForAutoplay(tracks, "Seed", ended, player)
        assert.deepEqual(
            ordered.map((t) => t.info?.identifier),
            ["a1", "s1"]
        )
    })
})
