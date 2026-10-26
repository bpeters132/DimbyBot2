import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    clearUpcomingOnLivePlayer,
    shouldForceClearSessionAfterUpcomingCleared,
    shuffleUpcomingOnLivePlayer,
} from "../../src/util/livePlayerQueueMutations.js"
import {
    clearPlayerSessionPreservePriorSnapshot,
    flushPlayerSessionSave,
    getSessionClearEpochForTests,
    markPlayerSessionPreservePriorSnapshot,
    setLivePlayerLookupForTests,
    setPlayerSessionPersistenceDbForTests,
    shouldPreservePriorPlayerSessionSnapshot,
} from "../../src/util/playerSessionPersistence.js"

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

function mockMutablePlayer(
    guildId: string,
    upcoming: Track[],
    current: Track | null = mockTrack("current")
): Player {
    const tracks = [...upcoming]
    return {
        guildId,
        voiceChannelId: "vc-1",
        textChannelId: "tc-1",
        playing: current != null,
        volume: 100,
        repeatMode: "off",
        paused: false,
        queue: {
            current,
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

describe("shouldForceClearSessionAfterUpcomingCleared", () => {
    it("is true only when clear left nothing snapshotFromPlayer can persist", () => {
        const empty = mockMutablePlayer("g", [], null)
        assert.equal(shouldForceClearSessionAfterUpcomingCleared(empty), true)

        const withCurrent = mockMutablePlayer("g", [])
        assert.equal(shouldForceClearSessionAfterUpcomingCleared(withCurrent), false)

        const queueOnly = mockMutablePlayer("g", [mockTrack("q")], null)
        assert.equal(shouldForceClearSessionAfterUpcomingCleared(queueOnly), false)
    })
})

describe("clearUpcomingOnLivePlayer", () => {
    afterEach(() => {
        setPlayerSessionPersistenceDbForTests(null)
    })

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

    it("returns stale when a successor replaced the expected player", async () => {
        const guildId = "guild-clear-successor"
        const expected = mockMutablePlayer(guildId, [mockTrack("old-a")])
        const successor = mockMutablePlayer(guildId, [mockTrack("new-a"), mockTrack("new-b")])
        const cleared = await clearUpcomingOnLivePlayer(() => successor, guildId, expected)
        assert.equal(cleared, "stale")
        assert.equal(successor.queue.tracks.length, 2)
        assert.equal(expected.queue.tracks.length, 1)
    })

    it("force-clears the session row when clear leaves no current and no upcoming", async () => {
        const guildId = "guild-clear-null-current"
        const events: string[] = []
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                events.push(`delete:${id}`)
            },
            upsertPlayerSession: async () => {
                events.push("upsert")
            },
        })
        const epochBefore = getSessionClearEpochForTests(guildId)
        const live = mockMutablePlayer(guildId, [mockTrack("a"), mockTrack("b")], null)

        const cleared = await clearUpcomingOnLivePlayer(() => live, guildId)

        assert.equal(cleared, 2)
        assert.equal(live.queue.tracks.length, 0)
        assert.deepEqual(events, [`delete:${guildId}`])
        assert.equal(getSessionClearEpochForTests(guildId), epochBefore + 1)
    })

    it("does not force-clear a successor session when splice races /stop+/play", async () => {
        const guildId = "guild-clear-splice-successor"
        const events: string[] = []
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                events.push(`delete:${id}`)
            },
        })
        const original = mockMutablePlayer(guildId, [mockTrack("a")], null)
        let liveRef: Player | undefined = original
        original.queue.splice = async (start: number, deleteCount: number, ...insert: Track[]) => {
            const removed = (original.queue.tracks as Track[]).splice(
                start,
                deleteCount,
                ...insert.flat()
            )
            // Concurrent /play installed a successor while splice awaited.
            liveRef = mockMutablePlayer(guildId, [mockTrack("successor")], null)
            return removed
        }

        const cleared = await clearUpcomingOnLivePlayer(() => liveRef, guildId, original)

        assert.equal(cleared, 1)
        assert.deepEqual(events, [])
        assert.equal(liveRef?.queue.tracks.length, 1)
    })

    it("releases preserve-prior so an intentional clear with a current track can persist", async () => {
        // Partial/concurrent restore marks preserve-prior; scheduleSave then no-ops and the
        // fuller DB row would resurrect cleared upcoming on the next restore.
        const guildId = "guild-clear-preserve-prior"
        const events: string[] = []
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => {
                events.push("upsert")
            },
            deletePlayerSession: async () => {
                events.push("delete")
            },
        })
        const live = mockMutablePlayer(guildId, [mockTrack("a"), mockTrack("b")])
        setLivePlayerLookupForTests((id) => (id === guildId ? live : undefined))
        markPlayerSessionPreservePriorSnapshot(guildId)

        try {
            const cleared = await clearUpcomingOnLivePlayer(() => live, guildId, live)
            assert.equal(cleared, 2)
            assert.equal(live.queue.tracks.length, 0)
            assert.equal(shouldPreservePriorPlayerSessionSnapshot(guildId), false)

            await flushPlayerSessionSave(guildId)
            assert.deepEqual(events, ["upsert"])
        } finally {
            clearPlayerSessionPreservePriorSnapshot(guildId)
            setLivePlayerLookupForTests(null)
            setPlayerSessionPersistenceDbForTests(null)
        }
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

    it("returns stale when a successor replaced the expected player", async () => {
        const guildId = "guild-shuffle-successor"
        const expected = mockMutablePlayer(guildId, [mockTrack("e1"), mockTrack("e2")])
        const successor = mockMutablePlayer(guildId, [mockTrack("s1"), mockTrack("s2")])
        const shuffled = await shuffleUpcomingOnLivePlayer(() => successor, guildId, expected)
        assert.equal(shuffled, "stale")
        assert.deepEqual(
            successor.queue.tracks.map((t) => t.info.title),
            ["s1", "s2"]
        )
    })
})
