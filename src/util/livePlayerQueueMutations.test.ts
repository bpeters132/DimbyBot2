import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { clearUpcomingOnLivePlayer, shuffleUpcomingOnLivePlayer } from "./livePlayerQueueMutations.js"

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

function mockMutablePlayer(guildId: string, upcoming: Track[]): Player {
    const tracks = [...upcoming]
    return {
        guildId,
        voiceChannelId: "vc-1",
        textChannelId: "tc-1",
        playing: true,
        queue: {
            current: mockTrack("current"),
            tracks,
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                return tracks.splice(start, deleteCount, ...insert.flat())
            },
            async shuffle() {
                tracks.reverse()
            },
        },
        get() {
            return undefined
        },
    } as unknown as Player
}

describe("clearUpcomingOnLivePlayer", () => {
    it("clears the live player resolved under the lock, not a stale destroyed reference", async () => {
        const guildId = "guild-clear-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("a"), mockTrack("b")])
        const live = mockMutablePlayer(guildId, [mockTrack("kept-a"), mockTrack("kept-b")])

        const cleared = await clearUpcomingOnLivePlayer(() => live, guildId)

        assert.equal(cleared, 2)
        assert.equal(live.queue.tracks.length, 0)
        assert.equal(staleDestroyed.queue.tracks.length, 2)
    })

    it("returns 0 when /stop destroyed the player before the lock ran", async () => {
        const cleared = await clearUpcomingOnLivePlayer(() => undefined, "guild-clear-gone")
        assert.equal(cleared, 0)
    })
})

describe("shuffleUpcomingOnLivePlayer", () => {
    it("shuffles only the live player under the lock", async () => {
        const guildId = "guild-shuffle-stale"
        const staleDestroyed = mockMutablePlayer(guildId, [mockTrack("z1"), mockTrack("z2")])
        const live = mockMutablePlayer(guildId, [mockTrack("l1"), mockTrack("l2")])

        const shuffled = await shuffleUpcomingOnLivePlayer(() => live, guildId)

        assert.equal(shuffled, true)
        assert.deepEqual(
            live.queue.tracks.map((t) => t.info.title),
            ["l2", "l1"]
        )
        assert.deepEqual(
            staleDestroyed.queue.tracks.map((t) => t.info.title),
            ["z1", "z2"]
        )
    })

    it("returns false when the player was destroyed during the wait", async () => {
        const shuffled = await shuffleUpcomingOnLivePlayer(() => undefined, "guild-shuffle-gone")
        assert.equal(shuffled, false)
    })
})
