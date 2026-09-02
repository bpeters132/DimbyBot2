import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { enqueueSearchTracksAssumingSearchDone } from "./enqueueSearchTracks.js"

function mockTrack(id: string): Track {
    return {
        encoded: `enc-${id}`,
        info: {
            title: id,
            author: "Artist",
            uri: `https://example.com/${id}`,
            duration: 1000,
            isStream: false,
            identifier: id,
            isSeekable: true,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
        },
        requester: undefined,
    } as unknown as Track
}

function mockMutablePlayer(guildId: string, initial: Track[] = [], playing = true): Player {
    const tracks = [...initial]
    return {
        guildId,
        playing,
        queue: {
            current: playing ? mockTrack("current") : null,
            tracks,
            add(items: Track | Track[]) {
                const list = Array.isArray(items) ? items : [items]
                tracks.push(...list)
            },
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                return tracks.splice(start, deleteCount, ...insert.flat())
            },
        },
        get() {
            return undefined
        },
        async play() {
            return undefined
        },
    } as unknown as Player
}

describe("enqueueSearchTracksAssumingSearchDone", () => {
    it("adds to the live player resolved under the lock, not a stale destroyed reference", async () => {
        const guildId = "guild-search-enqueue-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const live = mockMutablePlayer(guildId, [mockTrack("kept")])

        const outcome = await enqueueSearchTracksAssumingSearchDone(
            () => live,
            guildId,
            { loadType: "track", tracks: [mockTrack("web-add")] },
            "user-1"
        )

        assert.equal(outcome.status, "ok")
        if (outcome.status !== "ok") return
        assert.equal(outcome.playbackStarted, false)
        assert.equal(live.queue.tracks.map((t) => t.info.title).join(","), "kept,web-add")
        assert.equal(staleDestroyed.queue.tracks.length, 1)
        assert.equal(staleDestroyed.queue.tracks[0]?.info.title, "old")
    })

    it("returns no_player when /stop destroyed the player during search", async () => {
        const outcome = await enqueueSearchTracksAssumingSearchDone(
            () => undefined,
            "guild-search-enqueue-gone",
            { loadType: "track", tracks: [mockTrack("lost")] },
            "user-1"
        )
        assert.equal(outcome.status, "no_player")
    })

    it("enqueues every track when Lavalink reports PLAYLIST_LOADED", async () => {
        const guildId = "guild-search-playlist-loaded"
        const live = mockMutablePlayer(guildId, [])
        const outcome = await enqueueSearchTracksAssumingSearchDone(
            () => live,
            guildId,
            { loadType: "PLAYLIST_LOADED", tracks: [mockTrack("p1"), mockTrack("p2")] },
            "user-1"
        )
        assert.equal(outcome.status, "ok")
        assert.equal(live.queue.tracks.map((t) => t.info.title).join(","), "p1,p2")
    })
})
