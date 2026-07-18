import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { playerHasQueueContent } from "./playlistQueue.js"

function mockTrack(): Track {
    return {
        encoded: "enc",
        info: {
            title: "Song",
            author: "Artist",
            uri: "https://example.com/t",
            duration: 1000,
            isStream: false,
            identifier: "id",
            isSeekable: true,
            sourceName: "http",
            artworkUrl: null,
            isrc: null,
        },
        requester: "user-1",
    } as unknown as Track
}

function mockEmptyPlayer(guildId: string): Player {
    return {
        guildId,
        queue: {
            current: null,
            tracks: [] as Track[],
        },
    } as unknown as Player
}

describe("playlist orphan cleanup vs enqueue lock", () => {
    it("skips destroy when enqueue wins the guild queue lock first", async () => {
        const guildId = "guild-playlist-race"
        const player = mockEmptyPlayer(guildId)
        let destroyed = false

        await withGuildPlayerQueueLock(guildId, async () => {
            player.queue.tracks.push(mockTrack())
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
        const player = mockEmptyPlayer(guildId)
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
            player.queue.tracks.push(mockTrack())
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
