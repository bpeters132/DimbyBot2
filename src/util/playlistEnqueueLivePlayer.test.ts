import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    enqueueResolvedPlaylistTracks,
    replaceUpcomingWithResolvedPlaylistTracks,
} from "./playlistQueue.js"

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

function mockMutablePlayer(guildId: string, initial: Track[] = []): Player {
    const tracks = [...initial]
    return {
        guildId,
        playing: true,
        queue: {
            current: null,
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
    } as unknown as Player
}

describe("playlist enqueue live-player re-resolve", () => {
    it("enqueueResolvedPlaylistTracks adds to the live player, not a stale destroyed ref", async () => {
        const guildId = "guild-playlist-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const liveSuccessor = mockMutablePlayer(guildId, [mockTrack("kept")])

        const outcome = await enqueueResolvedPlaylistTracks(
            () => liveSuccessor,
            guildId,
            [mockTrack("new")],
            "user-1",
            false
        )

        assert.notEqual(outcome, "no_player")
        if (outcome === "no_player") return
        assert.equal(outcome.queued, 1)
        assert.equal(liveSuccessor.queue.tracks.map((t) => t.info.title).join(","), "kept,new")
        assert.equal(staleDestroyed.queue.tracks.length, 1)
        assert.equal(staleDestroyed.queue.tracks[0]?.info.title, "old")
    })

    it("enqueueResolvedPlaylistTracks returns no_player when destroyed during resolve", async () => {
        const outcome = await enqueueResolvedPlaylistTracks(
            () => undefined,
            "guild-playlist-gone",
            [mockTrack("lost")],
            "user-1",
            false
        )
        assert.equal(outcome, "no_player")
    })

    it("replaceUpcomingWithResolvedPlaylistTracks refuses a destroyed player", async () => {
        const guildId = "guild-playlist-replace-gone"
        const stale = mockMutablePlayer(guildId, [mockTrack("upcoming")])

        const outcome = await replaceUpcomingWithResolvedPlaylistTracks(
            () => undefined,
            guildId,
            [mockTrack("replacement")],
            "user-1",
            false
        )

        assert.equal(outcome, "no_player")
        assert.equal(stale.queue.tracks.length, 1)
        assert.equal(stale.queue.tracks[0]?.info.title, "upcoming")
    })

    it("replaceUpcomingWithResolvedPlaylistTracks replaces on the live player only", async () => {
        const guildId = "guild-playlist-replace-live"
        const staleDestroyed = mockMutablePlayer(guildId, [
            mockTrack("stale-a"),
            mockTrack("stale-b"),
        ])
        const live = mockMutablePlayer(guildId, [mockTrack("live-a")])

        const outcome = await replaceUpcomingWithResolvedPlaylistTracks(
            () => live,
            guildId,
            [mockTrack("from-playlist")],
            "user-1",
            false
        )

        assert.notEqual(outcome, "no_player")
        if (outcome === "no_player") return
        assert.equal(outcome.queued, 1)
        assert.equal(live.queue.tracks.map((t) => t.info.title).join(","), "from-playlist")
        assert.equal(staleDestroyed.queue.tracks.length, 2)
    })

    it("enqueueResolvedPlaylistTracks returns no_player when a successor replaces resolve-time player", async () => {
        const guildId = "guild-playlist-successor"
        const resolvePlayer = mockMutablePlayer(guildId, [mockTrack("old")])
        const successor = mockMutablePlayer(guildId, [mockTrack("kept")])
        let calls = 0

        const outcome = await enqueueResolvedPlaylistTracks(
            () => {
                calls += 1
                return calls === 1 ? resolvePlayer : successor
            },
            guildId,
            [mockTrack("pollution")],
            "user-1",
            false
        )

        assert.equal(outcome, "no_player")
        assert.equal(successor.queue.tracks.map((t) => t.info.title).join(","), "kept")
        assert.equal(resolvePlayer.queue.tracks.map((t) => t.info.title).join(","), "old")
    })

    it("replaceUpcomingWithResolvedPlaylistTracks refuses a successor after resolve", async () => {
        const guildId = "guild-playlist-replace-successor"
        const resolvePlayer = mockMutablePlayer(guildId, [mockTrack("old")])
        const successor = mockMutablePlayer(guildId, [mockTrack("kept")])
        let calls = 0

        const outcome = await replaceUpcomingWithResolvedPlaylistTracks(
            () => {
                calls += 1
                return calls === 1 ? resolvePlayer : successor
            },
            guildId,
            [mockTrack("pollution")],
            "user-1",
            false
        )

        assert.equal(outcome, "no_player")
        assert.equal(successor.queue.tracks.map((t) => t.info.title).join(","), "kept")
        assert.equal(resolvePlayer.queue.tracks.map((t) => t.info.title).join(","), "old")
    })
})
