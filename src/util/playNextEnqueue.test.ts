import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { enqueuePlayNextTrackAssumingSearchDone } from "./playNextEnqueue.js"

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
            add(items: Track | Track[], index?: number) {
                const list = Array.isArray(items) ? items : [items]
                if (typeof index === "number") {
                    tracks.splice(index, 0, ...list)
                } else {
                    tracks.push(...list)
                }
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

describe("enqueuePlayNextTrackAssumingSearchDone", () => {
    it("adds to the live player resolved under the lock, not a stale destroyed reference", async () => {
        const guildId = "guild-playnext-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("old")])
        const liveSuccessor = mockMutablePlayer(guildId, [mockTrack("kept")])
        let live: Player | undefined = liveSuccessor

        const track = mockTrack("playnext")
        // Simulate the old bug's capture: callers previously closed over `staleDestroyed`.
        assert.notEqual(staleDestroyed, liveSuccessor)

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => live,
            guildId,
            track,
            "user-1"
        )

        assert.equal(outcome, "ok")
        assert.equal(liveSuccessor.queue.tracks[0]?.info.title, "playnext")
        assert.equal(liveSuccessor.queue.tracks.length, 2)
        assert.equal(staleDestroyed.queue.tracks.length, 1)
        assert.equal(staleDestroyed.queue.tracks[0]?.info.title, "old")
    })

    it("returns no_player when the guild player was destroyed during search", async () => {
        const guildId = "guild-playnext-gone"
        const track = mockTrack("lost")

        const outcome = await enqueuePlayNextTrackAssumingSearchDone(
            () => undefined,
            guildId,
            track,
            "user-1"
        )

        assert.equal(outcome, "no_player")
    })
})
