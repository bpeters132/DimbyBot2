import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    enqueueMusicManagerTracksAssumingSearchDone,
    scheduleSaveIfPlayerStillLive,
} from "./musicManagerEnqueue.js"

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
                return Promise.resolve()
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

describe("enqueueMusicManagerTracksAssumingSearchDone", () => {
    it("adds to the live player resolved under the lock, not a stale destroyed reference", async () => {
        const guildId = "guild-mm-enqueue-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const live = mockMutablePlayer(guildId, [mockTrack("kept")])

        const outcome = await enqueueMusicManagerTracksAssumingSearchDone(
            () => live,
            guildId,
            { isPlaylist: false, tracks: [mockTrack("discord-add")] },
            "user-1"
        )

        assert.equal(outcome.status, "ok")
        if (outcome.status !== "ok") return
        assert.equal(live.queue.tracks.map((t) => t.info.title).join(","), "kept,discord-add")
        assert.equal(staleDestroyed.queue.tracks.length, 1)
        assert.equal(staleDestroyed.queue.tracks[0]?.info.title, "old")
    })

    it("returns no_player when /stop destroyed the player during search", async () => {
        const outcome = await enqueueMusicManagerTracksAssumingSearchDone(
            () => undefined,
            "guild-mm-enqueue-gone",
            { isPlaylist: false, tracks: [mockTrack("lost")] },
            "user-1"
        )
        assert.equal(outcome.status, "no_player")
    })

    it("enqueues playlist tracks onto the live player only", async () => {
        const guildId = "guild-mm-enqueue-playlist"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const live = mockMutablePlayer(guildId, [])

        const outcome = await enqueueMusicManagerTracksAssumingSearchDone(
            () => live,
            guildId,
            {
                isPlaylist: true,
                tracks: [mockTrack("p1"), mockTrack("p2")],
                playlistName: "Mix",
            },
            "user-1"
        )

        assert.equal(outcome.status, "ok")
        if (outcome.status !== "ok") return
        assert.match(outcome.feedbackText, /Mix/)
        assert.equal(live.queue.tracks.map((t) => t.info.title).join(","), "p1,p2")
        assert.equal(staleDestroyed.queue.tracks.length, 1)
    })

    it("scheduleSaveIfPlayerStillLive ignores a destroyed zombie reference", async () => {
        const guildId = "guild-mm-save-zombie"
        const zombie = mockMutablePlayer(guildId, [mockTrack("stopped-queue")])
        let live: Player | undefined

        scheduleSaveIfPlayerStillLive(() => live, zombie)
        // No throw; live is undefined so save must be skipped (zombie must not resurrect).
        assert.equal(live, undefined)

        live = mockMutablePlayer(guildId, [mockTrack("kept")])
        scheduleSaveIfPlayerStillLive(() => live, live)
        scheduleSaveIfPlayerStillLive(() => live, zombie)
    })
})
