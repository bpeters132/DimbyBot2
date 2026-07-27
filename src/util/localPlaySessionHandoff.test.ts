import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    acquirePlayerSessionClearSuppressLease,
    clearPlayerSession,
    setPlayerSessionPersistenceDbForTests,
    shouldSkipPlayerSessionClear,
} from "./playerSessionPersistence.js"
import { beginLocalPlaySessionHandoff } from "./localPlaySessionHandoff.js"

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

function mockPlayer(guildId: string): Player {
    const store = new Map<string, unknown>()
    return {
        guildId,
        voiceChannelId: "vc-1",
        textChannelId: "text-1",
        volume: 80,
        repeatMode: "off",
        paused: false,
        playing: true,
        queue: {
            current: mockTrack(),
            tracks: [],
        },
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => {
            store.set(key, value)
        },
    } as unknown as Player
}

describe("beginLocalPlaySessionHandoff", () => {
    afterEach(() => {
        setPlayerSessionPersistenceDbForTests(null)
    })

    it("keeps the session row when local join fails after Lavalink destroy", async () => {
        const guildId = "guild-local-handoff-keep"
        const deletes: string[] = []
        const upserts: string[] = []

        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async (id) => {
                upserts.push(id)
            },
            deletePlayerSession: async (id) => {
                deletes.push(id)
            },
        })

        const player = mockPlayer(guildId)
        const handoff = await beginLocalPlaySessionHandoff(player, async () => {
            // Simulate playerDestroy → clearPlayerSession while lease is held.
            assert.equal(shouldSkipPlayerSessionClear(guildId), true)
            await clearPlayerSession(guildId)
        })
        handoff.markDestroyEventSeen()

        assert.equal(handoff.destroyedLavalink, true)
        assert.deepEqual(deletes, [])
        assert.ok(upserts.includes(guildId), "flush should persist snapshot before destroy")

        // Failed local VC join: leave the row; leftover release is a no-op after consume.
        handoff.releaseLeftoverSuppressLease()
        assert.deepEqual(deletes, [])
        assert.equal(shouldSkipPlayerSessionClear(guildId), false)

        // Later intentional clear (e.g. user stops) can still delete.
        await clearPlayerSession(guildId)
        assert.deepEqual(deletes, [guildId])
    })

    it("clears the session only after local Ready succeeds", async () => {
        const guildId = "guild-local-handoff-clear"
        const deletes: string[] = []

        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async (id) => {
                deletes.push(id)
            },
        })

        const player = mockPlayer(guildId)
        const handoff = await beginLocalPlaySessionHandoff(player, async () => {
            await clearPlayerSession(guildId)
        })
        handoff.markDestroyEventSeen()

        assert.deepEqual(deletes, [])
        await handoff.clearSessionAfterLocalReady()
        assert.deepEqual(deletes, [guildId])
    })

    it("releases leftover suppress lease when playerDestroy never fires", async () => {
        const guildId = "guild-local-handoff-timeout"
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })

        const player = mockPlayer(guildId)
        const handoff = await beginLocalPlaySessionHandoff(player, async () => {
            // Destroy "succeeds" but no playerDestroy / clear ran (timeout path).
        })

        assert.equal(shouldSkipPlayerSessionClear(guildId), true)
        handoff.releaseLeftoverSuppressLease()
        assert.equal(shouldSkipPlayerSessionClear(guildId), false)
    })

    it("releases the lease immediately when destroy throws", async () => {
        const guildId = "guild-local-handoff-destroy-fail"
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })

        const player = mockPlayer(guildId)
        const handoff = await beginLocalPlaySessionHandoff(player, async () => {
            throw new Error("destroy failed")
        })

        assert.equal(handoff.destroyedLavalink, false)
        assert.equal(shouldSkipPlayerSessionClear(guildId), false)
    })

    it("does not double-release after playerDestroy consumed the lease", async () => {
        const guildId = "guild-local-handoff-no-double"
        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => undefined,
            deletePlayerSession: async () => undefined,
        })

        // Extra concurrent lease must survive releaseLeftover when destroy already consumed ours.
        const other = acquirePlayerSessionClearSuppressLease(guildId)
        const player = mockPlayer(guildId)
        const handoff = await beginLocalPlaySessionHandoff(player, async () => {
            await clearPlayerSession(guildId)
        })
        handoff.markDestroyEventSeen()

        handoff.releaseLeftoverSuppressLease()
        assert.equal(shouldSkipPlayerSessionClear(guildId), true)
        other.release()
        assert.equal(shouldSkipPlayerSessionClear(guildId), false)
    })
})
