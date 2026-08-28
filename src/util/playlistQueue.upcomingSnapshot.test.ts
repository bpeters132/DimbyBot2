import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    clearUpcomingQueue,
    restoreUpcomingQueue,
    snapshotUpcomingQueue,
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
        requester: "user-1",
    } as unknown as Track
}

function mockMutablePlayer(initial: Track[] = []): Player {
    const tracks = [...initial]
    return {
        guildId: "guild-upcoming",
        playing: true,
        queue: {
            current: mockTrack("current"),
            tracks,
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                return tracks.splice(start, deleteCount, ...insert.flat())
            },
        },
    } as unknown as Player
}

describe("upcoming queue snapshot helpers", () => {
    it("snapshotUpcomingQueue copies upcoming tracks without sharing the array", () => {
        const a = mockTrack("a")
        const b = mockTrack("b")
        const player = mockMutablePlayer([a, b])
        const snap = snapshotUpcomingQueue(player)
        assert.deepEqual(
            snap.map((t) => (t as Track).info.title),
            ["a", "b"]
        )
        snap.pop()
        assert.equal(player.queue.tracks.length, 2)
    })

    it("clearUpcomingQueue removes upcoming tracks and leaves queue.current alone", async () => {
        const player = mockMutablePlayer([mockTrack("a"), mockTrack("b")])
        await clearUpcomingQueue(player)
        assert.equal(player.queue.tracks.length, 0)
        assert.equal((player.queue.current as Track).info.title, "current")
    })

    it("clearUpcomingQueue is a no-op when upcoming is already empty", async () => {
        const player = mockMutablePlayer([])
        let spliced = false
        player.queue.splice = async () => {
            spliced = true
            return []
        }
        await clearUpcomingQueue(player)
        assert.equal(spliced, false)
    })

    it("restoreUpcomingQueue clears then reinserts the snapshot", async () => {
        const saved = [mockTrack("old-1"), mockTrack("old-2")]
        const player = mockMutablePlayer([mockTrack("poison")])
        await restoreUpcomingQueue(player, saved)
        assert.deepEqual(
            player.queue.tracks.map((t) => (t as Track).info.title),
            ["old-1", "old-2"]
        )
        assert.equal((player.queue.current as Track).info.title, "current")
    })

    it("restoreUpcomingQueue with an empty snapshot leaves upcoming empty", async () => {
        const player = mockMutablePlayer([mockTrack("poison")])
        await restoreUpcomingQueue(player, [])
        assert.equal(player.queue.tracks.length, 0)
    })
})
