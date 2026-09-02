import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { PersistedQueueTrack } from "../types/index.js"
import { persistedTrackFromLavalink, resolvePersistedTracks } from "./playerSessionTracks.js"

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
})
