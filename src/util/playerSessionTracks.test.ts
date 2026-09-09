import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Track } from "lavalink-client"
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

describe("trackMatchesStored", () => {
    it("matches URI scheme/host case-insensitively and ignores trailing slashes", () => {
        assert.equal(
            trackMatchesStored(
                mockTrack({ uri: "HTTPS://Example.com/track/" }),
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

    it("rejects differently cased YouTube video IDs", () => {
        assert.equal(
            trackMatchesStored(
                mockTrack({
                    title: "A",
                    uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                }),
                stored({
                    title: "B",
                    uri: "https://www.youtube.com/watch?v=dqw4w9wgxcq",
                })
            ),
            false
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

    it("rejects same-title tracks by a different artist", () => {
        assert.equal(
            trackMatchesStored(
                mockTrack({
                    title: "Hello World",
                    author: "Artist A",
                    uri: "https://cdn.example/a",
                }),
                stored({ title: "Hello World", author: "Artist B", uri: "https://cdn.example/b" })
            ),
            false
        )
    })

    it("does not treat empty resolved URI as a URI match", () => {
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

describe("resolvePersistedTracks metadata hydrate", () => {
    it("skips private/Docker-internal URIs without Lavalink search", async () => {
        const result = await resolvePersistedTracks(null, [
            stored({ uri: "http://invidious-companion:8282/secret" }),
            stored({ uri: "http://192.168.1.10/track.mp3", title: "Lan" }),
        ])
        assert.equal(result.resolved.length, 0)
        assert.equal(result.failed, 2)
        assert.equal(result.transientFailures, 0)
    })

    it("hydrates YouTube URIs as Queue metadata without searching", async () => {
        const result = await resolvePersistedTracks(null, [
            stored({
                uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                encoded: "stale-youtube-or-http-encoded",
            }),
        ])
        assert.equal(result.resolved.length, 1)
        assert.equal(result.failed, 0)
        assert.equal(result.transientFailures, 0)
        assert.equal(result.resolved[0]?.info.sourceName, "youtube")
        assert.equal(result.resolved[0]?.info.identifier, "dQw4w9WgXcQ")
    })

    it("hydrates Spotify catalog URIs as Queue metadata without searching", async () => {
        const spotifyUri = "https://open.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn"
        const result = await resolvePersistedTracks(null, [
            stored({
                uri: spotifyUri,
                encoded: "stale-companion-http-encoded",
            }),
        ])
        assert.equal(result.resolved.length, 1)
        assert.equal(result.failed, 0)
        assert.equal(result.resolved[0]?.info.sourceName, "spotify")
        assert.equal(result.resolved[0]?.info.uri, spotifyUri)
    })

    it("persists and hydrates ISRC for catalog YouTube search", async () => {
        const spotifyUri = "https://open.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn"
        const persisted = persistedTrackFromLavalink({
            encoded: "",
            info: {
                title: "Worth it",
                author: "Outr3ach",
                uri: spotifyUri,
                duration: 259000,
                isStream: false,
                identifier: "4hqIKGKzDVJXCnD80y2fyn",
                isSeekable: true,
                sourceName: "spotify",
                artworkUrl: null,
                isrc: "USRC17600001",
            },
            requester: undefined,
        } as never)
        assert.equal(persisted?.isrc, "USRC17600001")
        const result = await resolvePersistedTracks(null, [
            stored({
                uri: spotifyUri,
                isrc: persisted?.isrc,
            }),
        ])
        assert.equal(result.resolved[0]?.info.isrc, "USRC17600001")
    })

    it("hydrates public HTTP URIs as Queue metadata", async () => {
        const result = await resolvePersistedTracks(null, [stored()])
        assert.equal(result.resolved.length, 1)
        assert.equal(result.failed, 0)
        assert.equal(result.resolved[0]?.info.title, "Song")
        assert.equal(result.resolved[0]?.info.uri, "https://example.com/track")
    })

    it("skips encoded decode for spotify:track and play.spotify.com catalog forms", async () => {
        for (const spotifyUri of [
            "spotify:track:4hqIKGKzDVJXCnD80y2fyn",
            "https://play.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn",
        ]) {
            const result = await resolvePersistedTracks(null, [
                stored({
                    uri: spotifyUri,
                    encoded: "stale-companion-http-encoded",
                }),
            ])
            assert.equal(result.resolved.length, 1, spotifyUri)
            assert.equal(result.resolved[0]?.info.uri, spotifyUri)
        }
    })

    it("skips encoded decode for music.youtube.com and live YouTube URIs", async () => {
        for (const youtubeUri of [
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ",
        ]) {
            const result = await resolvePersistedTracks(null, [
                stored({
                    uri: youtubeUri,
                    encoded: "stale-youtube-or-http-encoded",
                }),
            ])
            assert.equal(result.resolved.length, 1, youtubeUri)
            assert.equal(result.resolved[0]?.info.sourceName, "youtube")
        }
    })
})
