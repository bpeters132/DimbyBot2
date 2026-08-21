import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player } from "lavalink-client"
import { resolveStoredPlaylistTracks } from "./playlistQueue.js"

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
