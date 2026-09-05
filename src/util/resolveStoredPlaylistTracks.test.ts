import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player } from "lavalink-client"
import { playerHasQueueContent, resolveStoredPlaylistTracks } from "./playlistQueue.js"
import { isYoutubePlaybackReady } from "./youtubePlaybackWindow.js"

/** Player is unused after JIT metadata resolve; keep a stub so call sites stay typed. */
function unusedPlayer(): Player {
    return {
        search: async () => {
            throw new Error("resolveStoredPlaylistTracks must not Lavalink-search")
        },
    } as unknown as Player
}

describe("resolveStoredPlaylistTracks metadata-only enqueue", () => {
    it("returns empty when there are no stored rows", async () => {
        const result = await resolveStoredPlaylistTracks(unusedPlayer(), [], "user-1")
        assert.deepEqual(result, { resolved: [], failed: 0 })
    })

    it("builds Queue metadata (empty encoded) without searching Lavalink", async () => {
        const result = await resolveStoredPlaylistTracks(
            unusedPlayer(),
            [
                {
                    uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    title: "Rick",
                    author: "Astley",
                    duration: 213000,
                    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                },
                {
                    uri: "https://open.spotify.com/track/4hqIKGKzDVJXCnD80y2fyn",
                    title: "Worth it",
                    author: "Outr3ach",
                    duration: 259000,
                    thumbnailUrl: null,
                },
                {
                    uri: "https://soundcloud.com/ok/track",
                    title: "Native",
                    author: "SC",
                    duration: 120000,
                    thumbnailUrl: null,
                },
            ],
            { id: "user-42" }
        )

        assert.equal(result.failed, 0)
        assert.equal(result.resolved.length, 3)

        const [yt, spotify, native] = result.resolved
        assert.equal(yt?.encoded, "")
        assert.equal(yt?.info.sourceName, "youtube")
        assert.equal(yt?.info.identifier, "dQw4w9WgXcQ")
        assert.equal(yt?.requester, "user-42")
        assert.equal(isYoutubePlaybackReady(yt!), false)

        assert.equal(spotify?.encoded, "")
        assert.equal(spotify?.info.sourceName, "spotify")
        assert.equal(spotify?.info.identifier, "4hqIKGKzDVJXCnD80y2fyn")
        assert.equal(spotify?.requester, "user-42")
        assert.equal(isYoutubePlaybackReady(spotify!), false)

        assert.equal(native?.encoded, "")
        assert.equal(native?.info.sourceName, "http")
        assert.equal(native?.requester, "user-42")
        assert.equal(isYoutubePlaybackReady(native!), false)
    })

    it("accepts a string requester id and defaults blank title/author", async () => {
        const result = await resolveStoredPlaylistTracks(
            unusedPlayer(),
            [
                {
                    uri: "https://www.youtube.com/watch?v=abcdefghijk",
                    title: "  ",
                    author: "",
                    duration: 1,
                    thumbnailUrl: null,
                },
            ],
            "user-string"
        )
        assert.equal(result.failed, 0)
        assert.equal(result.resolved[0]?.info.title, "Unknown")
        assert.equal(result.resolved[0]?.info.author, "Unknown")
        assert.equal(result.resolved[0]?.requester, "user-string")
    })

    it("counts blocked user-media URIs as failed and keeps valid neighbors", async () => {
        const result = await resolveStoredPlaylistTracks(
            unusedPlayer(),
            [
                {
                    uri: "http://10.0.0.5/a.mp3",
                    title: "bad",
                    author: "x",
                    duration: 1,
                    thumbnailUrl: null,
                },
                {
                    uri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    title: "ok",
                    author: "y",
                    duration: 2,
                    thumbnailUrl: null,
                },
            ],
            null
        )
        assert.equal(result.failed, 1)
        assert.equal(result.resolved.length, 1)
        assert.equal(result.resolved[0]?.info.title, "ok")
        assert.equal(result.resolved[0]?.requester, undefined)
    })
})

describe("playerHasQueueContent", () => {
    it("is true when current or upcoming tracks exist", () => {
        assert.equal(
            playerHasQueueContent({
                queue: { current: { encoded: "x" }, tracks: [] },
            } as unknown as Player),
            true
        )
        assert.equal(
            playerHasQueueContent({
                queue: { current: null, tracks: [{ encoded: "y" }] },
            } as unknown as Player),
            true
        )
        assert.equal(
            playerHasQueueContent({
                queue: { current: null, tracks: [] },
            } as unknown as Player),
            false
        )
    })
})
