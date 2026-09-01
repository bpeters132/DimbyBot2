import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import type { PersistedQueueTrack } from "../types/index.js"
import {
    persistedTrackFromLavalink,
    resolvePersistedTracks,
    trackMatchesStored,
} from "./playerSessionTracks.js"

function stored(overrides: Partial<PersistedQueueTrack> = {}): PersistedQueueTrack {
    return {
        title: "Song",
        author: "Artist",
        uri: "https://example.com/track",
        duration: 1000,
        encoded: null,
        requesterId: "user-1",
        thumbnailUrl: null,
        isStream: false,
        ...overrides,
    }
}

function mockTrack(info: Partial<Track["info"]> & { uri?: string; title?: string }): Track {
    return {
        info: {
            title: info.title ?? "Song",
            author: "Artist",
            uri: info.uri ?? "https://example.com/track",
            duration: 1000,
            isStream: false,
            isSeekable: true,
            identifier: info.identifier ?? "id",
            artworkUrl: info.artworkUrl ?? null,
            isrc: null,
            sourceName: info.sourceName ?? "http",
            ...info,
        },
    } as Track
}

function mockPlayer(hooks: {
    search?: (uri: string) => Promise<{ tracks: unknown[] }>
    decode?: (encoded: string) => Promise<unknown>
}): Player {
    return {
        search: async (uri: string) => {
            if (!hooks.search) throw new Error("search not stubbed")
            return hooks.search(uri)
        },
        node: {
            decode: {
                singleTrack: async (encoded: string) => {
                    if (!hooks.decode) throw new Error("decode not stubbed")
                    return hooks.decode(encoded)
                },
            },
        },
    } as unknown as Player
}

describe("trackMatchesStored", () => {
    it("matches URI case-insensitively and ignores trailing slashes", () => {
        assert.equal(
            trackMatchesStored(
                mockTrack({ uri: "HTTPS://Example.com/Track/" }),
                stored({ uri: "https://example.com/track" })
            ),
            true
        )
        assert.equal(
            trackMatchesStored(
                mockTrack({ uri: "https://example.com/track///" }),
                stored({ uri: "https://example.com/track/" })
            ),
            true
        )
    })

    it("falls back to trimmed case-insensitive title when URIs differ", () => {
        assert.equal(
            trackMatchesStored(
                mockTrack({ title: "  Hello World  ", uri: "https://cdn.example/a" }),
                stored({ title: "hello world", uri: "https://cdn.example/b" })
            ),
            true
        )
    })

    it("rejects blank titles and non-matching URI+title pairs", () => {
        assert.equal(
            trackMatchesStored(
                mockTrack({ title: "   ", uri: "https://cdn.example/a" }),
                stored({ title: "   ", uri: "https://cdn.example/b" })
            ),
            false
        )
        assert.equal(
            trackMatchesStored(
                mockTrack({ title: "A", uri: "https://cdn.example/a" }),
                stored({ title: "B", uri: "https://cdn.example/b" })
            ),
            false
        )
    })

    it("does not treat empty resolved URI as a URI match", () => {
        // Empty resolved URI skips the URI branch; title must still match.
        assert.equal(
            trackMatchesStored(
                mockTrack({ title: "Song", uri: "   " }),
                stored({ title: "Other", uri: "https://example.com/track" })
            ),
            false
        )
        assert.equal(
            trackMatchesStored(
                mockTrack({ title: "Song", uri: "   " }),
                stored({ title: "Song", uri: "https://example.com/track" })
            ),
            true
        )
    })
})

describe("persistedTrackFromLavalink", () => {
    it("returns null when URI is missing or blank", () => {
        assert.equal(persistedTrackFromLavalink(mockTrack({ uri: "" })), null)
        assert.equal(persistedTrackFromLavalink(mockTrack({ uri: "   " })), null)
        const unresolved = {
            info: { title: "X", author: "Y", uri: undefined, duration: 1 },
        } as unknown as Track
        assert.equal(persistedTrackFromLavalink(unresolved), null)
    })

    it("serializes defaults, requester, encoded, and stream flag", () => {
        const track = {
            info: {
                title: "  ",
                author: "",
                uri: " https://example.com/a ",
                duration: undefined,
                isStream: 1,
                isSeekable: true,
                identifier: "id",
                artworkUrl: null,
                isrc: null,
                sourceName: "http",
            },
            encoded: "enc-1",
            requester: { id: "99" },
        } as unknown as Track
        assert.deepEqual(persistedTrackFromLavalink(track), {
            title: "Unknown",
            author: "Unknown",
            uri: "https://example.com/a",
            duration: 0,
            encoded: "enc-1",
            requesterId: "99",
            thumbnailUrl: null,
            isStream: true,
        })
    })

    it("omits thumbnail for unresolved tracks without artwork", () => {
        const unresolved = {
            info: {
                title: "T",
                author: "A",
                uri: "https://example.com/u",
                duration: 5,
                isStream: false,
            },
            // no `encoded` / not a resolved Track shape for isResolvedTrack
        } as unknown as Track
        const out = persistedTrackFromLavalink(unresolved)
        assert.ok(out)
        assert.equal(out.thumbnailUrl, null)
        assert.equal(out.title, "T")
        assert.equal(out.author, "A")
        assert.equal(out.encoded, null)
    })
})

describe("resolvePersistedTracks transient vs permanent failures", () => {
    it("skips private/Docker-internal URIs without calling Lavalink search", async () => {
        let searched = false
        const player = mockPlayer({
            search: async () => {
                searched = true
                return { tracks: [] }
            },
        })
        const result = await resolvePersistedTracks(player, [
            stored({ uri: "http://invidious-companion:8282/secret" }),
            stored({ uri: "http://192.168.1.10/track.mp3", title: "Lan" }),
        ])
        assert.equal(searched, false)
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 2)
        assert.equal(result.transientFailures, 0)
    })

    it("skips blocked URIs even when encoded decode would succeed", async () => {
        let decoded = false
        let searched = false
        const player = mockPlayer({
            decode: async () => {
                decoded = true
                return {
                    info: {
                        title: "Lan",
                        uri: "http://192.168.1.10/track.mp3",
                    },
                }
            },
            search: async () => {
                searched = true
                return { tracks: [] }
            },
        })
        const result = await resolvePersistedTracks(player, [
            stored({
                uri: "http://192.168.1.10/track.mp3",
                title: "Lan",
                encoded: "blocked-http-encoded",
            }),
        ])
        assert.equal(decoded, false)
        assert.equal(searched, false)
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 0)
    })

    it("reports transientFailures when URI search throws", async () => {
        const player = mockPlayer({
            search: async () => {
                throw new Error("lavalink down")
            },
        })
        const result = await resolvePersistedTracks(player, [stored()])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 1)
    })

    it("treats empty search results as permanent failures", async () => {
        const player = mockPlayer({
            search: async () => ({ tracks: [] }),
        })
        const result = await resolvePersistedTracks(player, [stored()])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 0)
    })

    it("reports transientFailures when encoded-only decode throws", async () => {
        const player = mockPlayer({
            decode: async () => {
                throw new Error("decode failed")
            },
        })
        const result = await resolvePersistedTracks(player, [
            stored({ uri: "", encoded: "encoded-track" }),
        ])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 1)
    })

    it("keeps decode throw as transient when URI search returns empty", async () => {
        // Mirrors restore during a YouTube/source blip: decode fails, search returns []
        // without throwing. Must stay transient so restore preserves the session row.
        const player = mockPlayer({
            decode: async () => {
                throw new Error("decode failed")
            },
            search: async () => ({ tracks: [] }),
        })
        const result = await resolvePersistedTracks(player, [
            stored({ encoded: "encoded-track" }),
            stored({
                title: "Other",
                uri: "https://example.com/other",
                encoded: "encoded-other",
            }),
        ])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 2)
        assert.equal(result.transientFailures, 2)
    })

    it("keeps decode throw as transient when URI search returns a non-matching track", async () => {
        const player = mockPlayer({
            decode: async () => {
                throw new Error("decode failed")
            },
            search: async () => ({
                tracks: [
                    {
                        info: {
                            title: "Completely Different Song",
                            uri: "https://example.com/wrong",
                        },
                    },
                ],
            }),
        })
        const result = await resolvePersistedTracks(player, [stored({ encoded: "encoded-track" })])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 1)
        assert.equal(result.transientFailures, 1)
    })

    it("skips encoded decode for persisted YouTube URIs and searches the URI instead", async () => {
        let decoded = false
        const player = mockPlayer({
            decode: async () => {
                decoded = true
                throw new Error("should not decode youtube encoded tracks")
            },
            search: async (uri) => ({
                tracks: [
                    {
                        info: {
                            title: "Song",
                            uri,
                            sourceName: "youtube",
                            identifier: "dQw4w9WgXcQ",
                        },
                    },
                ],
            }),
        })
        const result = await resolvePersistedTracks(player, [
            stored({
                uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                encoded: "stale-youtube-or-http-encoded",
            }),
        ])
        assert.equal(decoded, false)
        assert.equal(result.resolved.length, 1)
        assert.equal(result.failed, 0)
        assert.equal(result.resolved[0]?.info.sourceName, "youtube")
    })

    it("skips encoded decode for persisted Spotify catalog URIs and searches the URI instead", async () => {
        let decoded = false
        const spotifyUri = "https://open.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn"
        const player = mockPlayer({
            decode: async () => {
                decoded = true
                throw new Error("should not decode stale companion HTTP encodings")
            },
            search: async (uri) => ({
                tracks: [
                    {
                        info: {
                            title: "Song",
                            uri,
                            sourceName: "spotify",
                            identifier: "4hqIKGKzDVJXCnD80y2fyn",
                        },
                    },
                ],
            }),
        })
        const result = await resolvePersistedTracks(player, [
            stored({
                uri: spotifyUri,
                encoded: "stale-companion-http-encoded",
            }),
        ])
        assert.equal(decoded, false)
        assert.equal(result.resolved.length, 1)
        assert.equal(result.failed, 0)
        assert.equal(result.resolved[0]?.info.sourceName, "spotify")
        assert.equal(result.resolved[0]?.info.uri, spotifyUri)
    })
})
