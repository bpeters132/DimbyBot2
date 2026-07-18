import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { Player, Track } from "lavalink-client"
import {
    acquirePlayerSessionClearSuppressLease,
    clearPlayerSession,
    clearPlayerSessionRestoreInProgress,
    getSessionClearEpochForTests,
    markPlayerSessionRestoreInProgress,
    setPlayerSessionPersistenceDbForTests,
    shouldSkipPlayerSessionClear,
    shouldSkipPlayerSessionClearForState,
    shouldUndoStaleSessionUpsert,
    snapshotFromPlayer,
    writePlayerSessionForTests,
} from "./playerSessionPersistence.js"
import type { PlayerSessionSnapshotV1 } from "../types/index.js"
import { persistedTrackFromLavalink } from "./playerSessionTracks.js"
import { getRequesterUserId } from "./rrqDisconnect.js"

function mockTrack(overrides: Partial<Track["info"]> & { encoded?: string } = {}): Track {
    const { encoded, ...infoOverrides } = overrides
    return {
        encoded: encoded ?? "enc",
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
            ...infoOverrides,
        },
        requester: "user-1",
    } as unknown as Track
}

function mockPlayer(opts: {
    current?: Track | null
    tracks?: Track[]
    volume?: number
    voiceChannelId?: string | null
}): Player {
    const store = new Map<string, unknown>()
    return {
        guildId: "guild-1",
        voiceChannelId: opts.voiceChannelId === undefined ? "vc-1" : opts.voiceChannelId,
        textChannelId: "text-1",
        volume: opts.volume ?? 80,
        repeatMode: "off",
        paused: false,
        playing: true,
        queue: {
            current: opts.current === undefined ? mockTrack() : opts.current,
            tracks: opts.tracks ?? [],
        },
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => {
            store.set(key, value)
        },
    } as unknown as Player
}

describe("getRequesterUserId", () => {
    it("reads string, object id, and safe numeric ids", () => {
        assert.equal(getRequesterUserId("abc"), "abc")
        assert.equal(getRequesterUserId({ id: "xyz" }), "xyz")
        assert.equal(getRequesterUserId({ id: 42 }), "42")
        assert.equal(getRequesterUserId({ id: 10n }), "10")
        assert.equal(getRequesterUserId(null), null)
        assert.equal(getRequesterUserId({}), null)
    })
})

describe("persistedTrackFromLavalink", () => {
    it("serializes a resolved track", () => {
        const persisted = persistedTrackFromLavalink(mockTrack())
        assert.ok(persisted)
        assert.equal(persisted.title, "Song")
        assert.equal(persisted.uri, "https://example.com/t")
        assert.equal(persisted.requesterId, "user-1")
        assert.equal(persisted.encoded, "enc")
    })

    it("returns null when uri is missing (nothing restorable)", () => {
        assert.equal(persistedTrackFromLavalink(mockTrack({ uri: "  " })), null)
        assert.equal(persistedTrackFromLavalink(mockTrack({ uri: undefined })), null)
    })

    it("falls back to Unknown for blank title/author", () => {
        const persisted = persistedTrackFromLavalink(mockTrack({ title: " ", author: "" }))
        assert.ok(persisted)
        assert.equal(persisted.title, "Unknown")
        assert.equal(persisted.author, "Unknown")
    })
})

describe("snapshotFromPlayer", () => {
    it("returns null for an empty player (must not drive session delete on save)", () => {
        assert.equal(snapshotFromPlayer(mockPlayer({ current: null, tracks: [] })), null)
    })

    it("builds a v1 snapshot when current or queue has tracks", () => {
        const withCurrent = snapshotFromPlayer(mockPlayer({}))
        assert.ok(withCurrent)
        assert.equal(withCurrent.version, 1)
        assert.equal(withCurrent.volume, 80)
        assert.equal(withCurrent.current?.title, "Song")

        const queueOnly = snapshotFromPlayer(
            mockPlayer({ current: null, tracks: [mockTrack({ title: "Q" })] })
        )
        assert.ok(queueOnly)
        assert.equal(queueOnly.current, null)
        assert.equal(queueOnly.queue[0]?.title, "Q")
    })
})

describe("shouldSkipPlayerSessionClear", () => {
    afterEach(() => {
        clearPlayerSessionRestoreInProgress("guild-restore")
    })

    it("skips clear while restore is in progress (orphan destroy must keep row)", () => {
        assert.equal(shouldSkipPlayerSessionClear("guild-restore"), false)
        markPlayerSessionRestoreInProgress("guild-restore")
        assert.equal(shouldSkipPlayerSessionClear("guild-restore"), true)
        clearPlayerSessionRestoreInProgress("guild-restore")
        assert.equal(shouldSkipPlayerSessionClear("guild-restore"), false)
    })

    it("skips clear for shutdown, restore, or suppress combinations", () => {
        assert.equal(shouldSkipPlayerSessionClearForState(false, false), false)
        assert.equal(shouldSkipPlayerSessionClearForState(true, false), true)
        assert.equal(shouldSkipPlayerSessionClearForState(false, true), true)
        assert.equal(shouldSkipPlayerSessionClearForState(true, true), true)
        assert.equal(shouldSkipPlayerSessionClearForState(false, false, true), true)
    })

    it("skips clear while a suppress lease is held (ephemeral web teardown)", () => {
        assert.equal(shouldSkipPlayerSessionClear("guild-ephemeral"), false)
        const lease = acquirePlayerSessionClearSuppressLease("guild-ephemeral")
        assert.equal(shouldSkipPlayerSessionClear("guild-ephemeral"), true)
        lease.release()
        assert.equal(shouldSkipPlayerSessionClear("guild-ephemeral"), false)
    })

    it("releasing one suppress lease does not clear a concurrent lease", () => {
        const leaseA = acquirePlayerSessionClearSuppressLease("guild-lease")
        const leaseB = acquirePlayerSessionClearSuppressLease("guild-lease")
        assert.equal(shouldSkipPlayerSessionClear("guild-lease"), true)
        leaseA.release()
        assert.equal(shouldSkipPlayerSessionClear("guild-lease"), true)
        leaseB.release()
        assert.equal(shouldSkipPlayerSessionClear("guild-lease"), false)
    })
})

describe("shouldUndoStaleSessionUpsert", () => {
    it("undoes when clear invalidated the write and no newer persist claimed generation", () => {
        // saveEpoch 1, clear bumped to 2, write still owns generation 5
        assert.equal(shouldUndoStaleSessionUpsert(2, 1, 5, 5), true)
    })

    it("keeps a newer persist when stale cleanup races after a later write claim", () => {
        // Stale write claimed gen 5; clear bumped gen; newer write claimed gen 7
        assert.equal(shouldUndoStaleSessionUpsert(2, 1, 7, 5), false)
    })

    it("does not undo when clear epoch still matches the save epoch", () => {
        assert.equal(shouldUndoStaleSessionUpsert(1, 1, 3, 3), false)
    })
})

describe("guild persistence serialization", () => {
    afterEach(() => {
        setPlayerSessionPersistenceDbForTests(null)
    })

    it("waits for a slow older upsert to finish before a newer upsert starts", async () => {
        const guildId = "guild-persist-upsert-order"
        const events: string[] = []
        let releaseOld!: () => void
        const oldUpsertGate = new Promise<void>((resolve) => {
            releaseOld = resolve
        })
        let upsertCalls = 0

        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async () => {
                upsertCalls += 1
                if (upsertCalls === 1) {
                    events.push("old-upsert-start")
                    await oldUpsertGate
                    events.push("old-upsert-end")
                    return
                }
                events.push("new-upsert")
            },
            deletePlayerSession: async () => {
                events.push("delete")
            },
        })

        const player = mockPlayer({})
        player.guildId = guildId
        const epoch = getSessionClearEpochForTests(guildId)
        const older = writePlayerSessionForTests(player, epoch)
        const newer = writePlayerSessionForTests(player, epoch)
        await Promise.resolve()
        assert.deepEqual(events, ["old-upsert-start"])
        releaseOld()
        await Promise.all([older, newer])
        assert.deepEqual(events, ["old-upsert-start", "old-upsert-end", "new-upsert"])
    })

    it("finishes clear delete before a subsequent upsert (clear-then-write order)", async () => {
        const guildId = "guild-persist-clear-order"
        const events: string[] = []
        let releaseDelete!: () => void
        const deleteGate = new Promise<void>((resolve) => {
            releaseDelete = resolve
        })

        setPlayerSessionPersistenceDbForTests({
            upsertPlayerSession: async (
                _guildId: string,
                _voiceChannelId: string,
                _textChannelId: string | null,
                _snapshot: PlayerSessionSnapshotV1
            ) => {
                events.push("upsert")
            },
            deletePlayerSession: async () => {
                events.push("delete-start")
                await deleteGate
                events.push("delete-end")
            },
        })

        const player = mockPlayer({})
        player.guildId = guildId
        const clearP = clearPlayerSession(guildId)
        await Promise.resolve()
        assert.deepEqual(events, ["delete-start"])
        // Epoch is bumped before the deferred delete awaits; new writes use the post-clear epoch.
        const writeP = writePlayerSessionForTests(player, getSessionClearEpochForTests(guildId))
        await Promise.resolve()
        assert.deepEqual(events, ["delete-start"])
        releaseDelete()
        await Promise.all([clearP, writeP])
        assert.deepEqual(events, ["delete-start", "delete-end", "upsert"])
    })
})
