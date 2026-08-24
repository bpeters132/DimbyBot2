import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player } from "lavalink-client"
import {
    resolveStoredPlaylistTracks,
    searchTracksForPlaylist,
} from "./playlistQueue.js"
import { USER_MEDIA_URL_BLOCKED } from "./userMediaUrl.js"

function mockPlayer(searchUris: string[]): Player {
    return {
        search: async (uri: string) => {
            searchUris.push(uri)
            return {
                tracks: [
                    {
                        info: {
                            title: "Hit",
                            uri,
                            author: "Artist",
                            duration: 1000,
                        },
                    },
                ],
            }
        },
    } as unknown as Player
}

describe("resolveStoredPlaylistTracks user-media deny", () => {
    it("does not Lavalink-search private or Docker-internal playlist URIs", async () => {
        const searched: string[] = []
        const player = mockPlayer(searched)
        const result = await resolveStoredPlaylistTracks(
            player,
            [
                { uri: "http://postgres-db:5432/" },
                { uri: "http://127.0.0.1:3001/health" },
                { uri: "http://10.0.0.5/audio.mp3" },
                { uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
            ],
            { id: "user-1" }
        )
        assert.deepEqual(searched, ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"])
        assert.equal(result.resolved.length, 1)
        assert.equal(result.failed, 3)
    })
})

describe("searchTracksForPlaylist user-media deny", () => {
    it("rejects private and Docker-internal URLs without calling Lavalink search", async () => {
        const searched: string[] = []
        const player = mockPlayer(searched)
        for (const uri of [
            "http://postgres-db:5432/",
            "http://127.0.0.1:3001/health",
            "http://10.0.0.5/audio.mp3",
        ]) {
            const result = await searchTracksForPlaylist(player, uri, { id: "user-1" })
            assert.equal(result.ok, false)
            if (!result.ok) {
                assert.equal(result.error, USER_MEDIA_URL_BLOCKED)
            }
        }
        assert.deepEqual(searched, [])
    })

    it("still searches public catalog URLs", async () => {
        const searched: string[] = []
        const player = mockPlayer(searched)
        const result = await searchTracksForPlaylist(
            player,
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            { id: "user-1" }
        )
        assert.equal(result.ok, true)
        assert.deepEqual(searched, ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"])
    })
})
