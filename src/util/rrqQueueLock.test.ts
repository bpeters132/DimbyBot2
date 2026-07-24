import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import { createGuildAsyncChain } from "./guildAsyncChain.js"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import {
    rebalancePlayerQueueRoundRobin,
    removeAndRebalanceRrqAfterDisconnect,
    stampRequesterUserIdOnTracks,
} from "./rrqDisconnect.js"

function mockTrack(id: string, requesterId: string): Track {
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
        requester: requesterId,
    } as unknown as Track
}

function mockMutablePlayer(guildId: string, initial: Track[] = []): Player {
    const tracks = [...initial]
    const store = new Map<string, unknown>()
    store.set("rrqEnabled", true)
    return {
        guildId,
        playing: true,
        queue: {
            current: null,
            tracks,
            add(items: Track | Track[], index?: number) {
                const list = Array.isArray(items) ? items : [items]
                if (typeof index === "number") tracks.splice(index, 0, ...list)
                else tracks.push(...list)
            },
            async splice(start: number, deleteCount: number, ...insert: Track[]) {
                return tracks.splice(start, deleteCount, ...insert.flat())
            },
        },
        get(key: string) {
            return store.get(key)
        },
        set(key: string, value: unknown) {
            store.set(key, value)
        },
    } as unknown as Player
}

describe("RRQ vs guild queue lock", () => {
    it("legacy separate RRQ chain can resurrect tracks after a guild-locked clear", async () => {
        // Documents the pre-fix race: RRQ splice on its own chain after clear under guild lock.
        const guildId = "guild-rrq-legacy-race"
        const player = mockMutablePlayer(guildId, [
            mockTrack("a1", "user-a"),
            mockTrack("b1", "user-b"),
            mockTrack("a2", "user-a"),
        ])
        const rrqOnlyChain = createGuildAsyncChain()

        let releaseRebalance!: () => void
        const rebalanceGate = new Promise<void>((resolve) => {
            releaseRebalance = resolve
        })

        const rebalanceP = rrqOnlyChain(guildId, async () => {
            const snapshot = [...player.queue.tracks]
            const n = snapshot.length
            await rebalanceGate
            await player.queue.splice(0, n, snapshot)
        })

        await Promise.resolve()

        const clearP = withGuildPlayerQueueLock(guildId, async () => {
            const size = player.queue.tracks.length
            if (size > 0) await player.queue.splice(0, size)
        })

        // Clear can finish while rebalance is still gated (separate chains).
        await clearP
        assert.equal(player.queue.tracks.length, 0)

        releaseRebalance()
        await rebalanceP
        assert.equal(player.queue.tracks.length, 3, "separate RRQ chain resurrects cleared queue")
    })

    it("shared guild lock prevents rebalance from resurrecting a concurrent clear", async () => {
        const guildId = "guild-rrq-shared-lock"
        const player = mockMutablePlayer(guildId, [
            mockTrack("a1", "user-a"),
            mockTrack("b1", "user-b"),
            mockTrack("a2", "user-a"),
        ])

        let releaseRebalance!: () => void
        const rebalanceGate = new Promise<void>((resolve) => {
            releaseRebalance = resolve
        })

        const rebalanceP = withGuildPlayerQueueLock(guildId, async () => {
            const snapshot = [...player.queue.tracks]
            const n = snapshot.length
            await rebalanceGate
            await player.queue.splice(0, n, snapshot)
        })

        await Promise.resolve()

        const clearP = withGuildPlayerQueueLock(guildId, async () => {
            const size = player.queue.tracks.length
            if (size > 0) await player.queue.splice(0, size)
        })

        releaseRebalance()
        await Promise.all([rebalanceP, clearP])
        assert.equal(player.queue.tracks.length, 0)
    })

    it("rebalancePlayerQueueRoundRobin serializes with clear on the guild lock", async () => {
        const guildId = "guild-rrq-public-api"
        const a1 = mockTrack("a1", "user-a")
        const b1 = mockTrack("b1", "user-b")
        stampRequesterUserIdOnTracks([a1], "user-a")
        stampRequesterUserIdOnTracks([b1], "user-b")
        const player = mockMutablePlayer(guildId, [a1, b1])

        const rebalanceP = rebalancePlayerQueueRoundRobin(player)
        const clearP = withGuildPlayerQueueLock(guildId, async () => {
            const size = player.queue.tracks.length
            if (size > 0) await player.queue.splice(0, size)
        })
        await Promise.all([rebalanceP, clearP])
        assert.equal(player.queue.tracks.length, 0)
    })

    it("removeAndRebalanceRrqAfterDisconnect removes only the disconnected user's tracks", async () => {
        const guildId = "guild-rrq-remove-user"
        const a1 = mockTrack("a1", "user-a")
        const b1 = mockTrack("b1", "user-b")
        const a2 = mockTrack("a2", "user-a")
        stampRequesterUserIdOnTracks([a1, a2], "user-a")
        stampRequesterUserIdOnTracks([b1], "user-b")
        const player = mockMutablePlayer(guildId, [a1, b1, a2])

        const removed = await removeAndRebalanceRrqAfterDisconnect(player, "user-a")
        assert.equal(removed, 2)
        assert.equal(player.queue.tracks.length, 1)
        assert.equal(player.queue.tracks[0]?.info.title, "b1")
    })
})
