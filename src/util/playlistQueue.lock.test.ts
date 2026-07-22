import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { playerHasQueueContent } from "./playlistQueue.js"

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

describe("playlist orphan cleanup vs enqueue lock", () => {
    it("skips destroy when enqueue wins the guild queue lock first", async () => {
        const guildId = "guild-playlist-race"
        const player = mockMutablePlayer(guildId)
        let destroyed = false

        await withGuildPlayerQueueLock(guildId, async () => {
            player.queue.add(mockTrack("queued"))
        })

        await withGuildPlayerQueueLock(guildId, async () => {
            if (playerHasQueueContent(player)) return
            destroyed = true
        })

        assert.equal(playerHasQueueContent(player), true)
        assert.equal(destroyed, false)
    })

    it("blocks enqueue until orphan cleanup finishes under the same lock", async () => {
        const guildId = "guild-playlist-serialize"
        const player = mockMutablePlayer(guildId)
        const events: string[] = []
        let releaseCleanup!: () => void
        const cleanupGate = new Promise<void>((resolve) => {
            releaseCleanup = resolve
        })
        let destroyed = false

        const cleanupP = withGuildPlayerQueueLock(guildId, async () => {
            events.push("cleanup-start")
            assert.equal(playerHasQueueContent(player), false)
            await cleanupGate
            if (playerHasQueueContent(player)) return
            destroyed = true
            events.push("cleanup-destroy")
        })

        const enqueueP = withGuildPlayerQueueLock(guildId, async () => {
            player.queue.add(mockTrack("queued"))
            events.push("enqueue")
        })

        await Promise.resolve()
        assert.deepEqual(events, ["cleanup-start"])
        assert.equal(playerHasQueueContent(player), false)
        releaseCleanup()
        await Promise.all([cleanupP, enqueueP])
        assert.equal(destroyed, true)
        assert.deepEqual(events, ["cleanup-start", "cleanup-destroy", "enqueue"])
        assert.equal(playerHasQueueContent(player), true)
    })
})

describe("playlist replace clear+add must share one guild lock", () => {
    it("keeps concurrent enqueue after clear+add (atomic replace contract)", async () => {
        const guildId = "guild-playlist-replace-atomic"
        const player = mockMutablePlayer(guildId, [mockTrack("old-upcoming")])
        const events: string[] = []
        let releaseReplace!: () => void
        const replaceGate = new Promise<void>((resolve) => {
            releaseReplace = resolve
        })

        // Mirrors replaceUpcomingWithResolvedPlaylistTracks: clear + add under one lock.
        const replaceP = withGuildPlayerQueueLock(guildId, async () => {
            const size = player.queue.tracks.length
            if (size > 0) await player.queue.splice(0, size)
            events.push("replace-cleared")
            await replaceGate
            player.queue.add([mockTrack("playlist-a"), mockTrack("playlist-b")])
            events.push("replace-added")
        })

        // Ensure replace has entered the lock before scheduling concurrent enqueue.
        await Promise.resolve()
        await Promise.resolve()
        assert.deepEqual(events, ["replace-cleared"])
        assert.deepEqual(
            player.queue.tracks.map((t) => t.info.title),
            []
        )

        const enqueueP = withGuildPlayerQueueLock(guildId, async () => {
            player.queue.add(mockTrack("concurrent-add"))
            events.push("enqueue")
        })

        releaseReplace()
        await Promise.all([replaceP, enqueueP])

        assert.deepEqual(events, ["replace-cleared", "replace-added", "enqueue"])
        assert.deepEqual(
            player.queue.tracks.map((t) => t.info.title),
            ["playlist-a", "playlist-b", "concurrent-add"]
        )
    })
})

describe("queue clear vs reorder under guild lock", () => {
    it("prevents clear from interleaving between reorder remove and insert", async () => {
        const guildId = "guild-reorder-clear-race"
        const player = mockMutablePlayer(guildId, [
            mockTrack("a"),
            mockTrack("b"),
            mockTrack("c"),
        ])
        const events: string[] = []
        let releaseReorder!: () => void
        const reorderGate = new Promise<void>((resolve) => {
            releaseReorder = resolve
        })

        const reorderP = withGuildPlayerQueueLock(guildId, async () => {
            events.push("reorder-remove")
            const [track] = await player.queue.splice(0, 1)
            await reorderGate
            await player.queue.splice(player.queue.tracks.length, 0, track!)
            events.push("reorder-insert")
        })

        const clearP = withGuildPlayerQueueLock(guildId, async () => {
            const size = player.queue.tracks.length
            if (size > 0) await player.queue.splice(0, size)
            events.push("cleared")
        })

        await Promise.resolve()
        assert.deepEqual(events, ["reorder-remove"])
        releaseReorder()
        await Promise.all([reorderP, clearP])
        assert.deepEqual(events, ["reorder-remove", "reorder-insert", "cleared"])
        assert.equal(player.queue.tracks.length, 0)
    })
})
