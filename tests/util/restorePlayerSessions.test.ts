import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isRestoreHydratePlayerStillLive,
    isStaleSessionDiscordError,
    guildIdsNeedingRestoreSaveGuard,
    shouldAbandonRestoreForConcurrentQueue,
    shouldDeleteStaleRestoredSession,
    shouldPersistConcurrentAbandonSession,
    restoredLiveTrackCount,
    deferredRestoreGuardAction,
    releaseDeferredRestoreGuards,
    restoreHydratePersistAction,
    retainedRestoredTrackCount,
    shouldMarkPreservePriorAfterDeferredRestore,
    shouldPersistRestoredPlayerSession,
    shouldPreservePriorSnapshotAfterRestoreDefer,
    shouldSkipRestoreHydrateForLivePlayer,
} from "../../src/util/restorePlayerSessions.js"

describe("isStaleSessionDiscordError", () => {
    it("treats unknown channel/guild as permanently stale (safe to delete session)", () => {
        assert.equal(isStaleSessionDiscordError({ code: 10003 }), true)
        assert.equal(isStaleSessionDiscordError({ code: 10004 }), true)
        assert.equal(isStaleSessionDiscordError({ code: "10003" }), true)
    })

    it("treats permission, rate-limit, and network-shaped failures as transient (keep session)", () => {
        assert.equal(isStaleSessionDiscordError({ code: 50001 }), false) // Missing Access
        assert.equal(isStaleSessionDiscordError({ code: 50013 }), false) // Missing Permissions
        assert.equal(isStaleSessionDiscordError({ code: 429 }), false)
        assert.equal(isStaleSessionDiscordError({ code: "EAI_AGAIN" }), false)
        assert.equal(isStaleSessionDiscordError(new Error("fetch failed")), false)
        assert.equal(isStaleSessionDiscordError(null), false)
    })
})

describe("restoredLiveTrackCount", () => {
    it("counts current plus upcoming", () => {
        assert.equal(
            restoredLiveTrackCount({ queue: { current: { id: "now" }, tracks: [{}, {}] } }),
            3
        )
        assert.equal(restoredLiveTrackCount({ queue: { current: null, tracks: [{}, {}] } }), 2)
        assert.equal(restoredLiveTrackCount({ queue: { current: { id: "now" }, tracks: [] } }), 1)
        assert.equal(restoredLiveTrackCount({ queue: { current: null, tracks: [] } }), 0)
    })
})

describe("retainedRestoredTrackCount", () => {
    it("does not count a newly enqueued track as a retained restored track", () => {
        const restored = [
            { info: { uri: "https://youtu.be/a" } },
            { info: { uri: "https://youtu.be/b" } },
        ]
        const live = [
            { info: { uri: "https://youtu.be/a" } },
            { info: { uri: "https://youtu.be/c" } },
        ]
        assert.equal(retainedRestoredTrackCount(restored, live), 1)
    })
})

describe("shouldPersistRestoredPlayerSession", () => {
    it("allows save when every stored track is still on the live player", () => {
        assert.equal(
            shouldPersistRestoredPlayerSession({
                transientFailures: 0,
                storedPlayableCount: 5,
                liveTrackCount: 5,
                retainedRestoredCount: 5,
            }),
            true
        )
    })

    it("blocks save when at least one track failed transiently (partial hydrate)", () => {
        // One resolved + one transient failure must not overwrite the full prior snapshot.
        assert.equal(
            shouldPersistRestoredPlayerSession({
                transientFailures: 1,
                storedPlayableCount: 5,
                liveTrackCount: 4,
                retainedRestoredCount: 4,
            }),
            false
        )
        assert.equal(
            shouldPersistRestoredPlayerSession({
                transientFailures: 2,
                storedPlayableCount: 5,
                liveTrackCount: 5,
                retainedRestoredCount: 5,
            }),
            false
        )
    })

    it("blocks save when JIT prepare dropped heads (thinned live queue must not wipe DB)", () => {
        assert.equal(
            shouldPersistRestoredPlayerSession({
                transientFailures: 0,
                storedPlayableCount: 50,
                liveTrackCount: 49,
                retainedRestoredCount: 49,
            }),
            false
        )
        assert.equal(
            shouldPersistRestoredPlayerSession({
                transientFailures: 0,
                storedPlayableCount: 50,
                liveTrackCount: 0,
                retainedRestoredCount: 0,
            }),
            false
        )
    })

    it("blocks save when a dropped restored track is replaced by a new track", () => {
        assert.equal(
            shouldPersistRestoredPlayerSession({
                transientFailures: 0,
                storedPlayableCount: 2,
                liveTrackCount: 2,
                retainedRestoredCount: 1,
            }),
            false
        )
    })
})

describe("restoreHydratePersistAction", () => {
    it("keeps the DB row and cancels pending saves when the live queue is intact", () => {
        // Full hydrate must not schedulePlayerSessionSave: trackStart's debounced save
        // can race prefetch drops and thin the already-correct snapshot.
        assert.equal(
            restoreHydratePersistAction({
                transientFailures: 0,
                storedPlayableCount: 5,
                liveTrackCount: 5,
                retainedRestoredCount: 5,
            }),
            "keep-db-cancel-pending"
        )
    })

    it("marks preserve-prior when JIT/prefetch thinned the live queue", () => {
        assert.equal(
            restoreHydratePersistAction({
                transientFailures: 0,
                storedPlayableCount: 50,
                liveTrackCount: 48,
                retainedRestoredCount: 48,
            }),
            "preserve-prior"
        )
    })

    it("marks preserve-prior when resolve had transient failures", () => {
        assert.equal(
            restoreHydratePersistAction({
                transientFailures: 1,
                storedPlayableCount: 5,
                liveTrackCount: 5,
                retainedRestoredCount: 5,
            }),
            "preserve-prior"
        )
    })
})

describe("shouldPersistConcurrentAbandonSession", () => {
    it("blocks save when restore still had playable tracks (thin concurrent queue must not wipe DB)", () => {
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 50, transientFailures: 0 }),
            false
        )
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 1, transientFailures: 0 }),
            false
        )
    })

    it("blocks save when resolve failed only transiently (even with zero playable)", () => {
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 0, transientFailures: 1 }),
            false
        )
    })

    it("allows save when every stored track failed deterministically (prior row unrecoverable)", () => {
        assert.equal(
            shouldPersistConcurrentAbandonSession({ playableCount: 0, transientFailures: 0 }),
            true
        )
    })
})

describe("shouldSkipRestoreHydrateForLivePlayer", () => {
    it("skips hydrate when the live player already has a current track or upcoming queue", () => {
        assert.equal(
            shouldSkipRestoreHydrateForLivePlayer({
                queue: { current: { id: "now" }, tracks: [] },
            }),
            true
        )
        assert.equal(
            shouldSkipRestoreHydrateForLivePlayer({
                queue: { current: null, tracks: [{ id: "a" }] },
            }),
            true
        )
    })

    it("does not skip an empty manager shell (createPlayer before search finished)", () => {
        assert.equal(
            shouldSkipRestoreHydrateForLivePlayer({
                queue: { current: null, tracks: [] },
            }),
            false
        )
        assert.equal(shouldSkipRestoreHydrateForLivePlayer(null), false)
        assert.equal(shouldSkipRestoreHydrateForLivePlayer(undefined), false)
    })
})

describe("shouldPreservePriorSnapshotAfterRestoreDefer", () => {
    it("preserves the fuller snapshot when a concurrent /play filled the player during a deferred voice fetch", () => {
        assert.equal(
            shouldPreservePriorSnapshotAfterRestoreDefer({
                queue: { current: { id: "thin" }, tracks: [] },
            }),
            true
        )
        assert.equal(
            shouldPreservePriorSnapshotAfterRestoreDefer({
                queue: { current: null, tracks: [{ id: "a" }] },
            }),
            true
        )
    })

    it("does not mark preserve-prior when nothing concurrent landed (later /play may persist)", () => {
        assert.equal(shouldPreservePriorSnapshotAfterRestoreDefer(null), false)
        assert.equal(shouldPreservePriorSnapshotAfterRestoreDefer(undefined), false)
        assert.equal(
            shouldPreservePriorSnapshotAfterRestoreDefer({
                queue: { current: null, tracks: [] },
            }),
            false
        )
    })
})

describe("shouldMarkPreservePriorAfterDeferredRestore", () => {
    it("marks preserve-prior when the session row is still there and the live player has a queue", () => {
        assert.equal(
            shouldMarkPreservePriorAfterDeferredRestore({
                sessionRowExists: true,
                liveHasQueue: true,
            }),
            true
        )
    })

    it("does not mark preserve-prior after /stop deleted the session row", () => {
        // Transient voice fetch must not mark before this check. An early mark
        // would stick after the batch finally sees no row and block successor saves.
        assert.equal(
            shouldMarkPreservePriorAfterDeferredRestore({
                sessionRowExists: false,
                liveHasQueue: true,
            }),
            false
        )
        assert.equal(
            shouldMarkPreservePriorAfterDeferredRestore({
                sessionRowExists: true,
                liveHasQueue: false,
            }),
            false
        )
    })
})

describe("deferredRestoreGuardAction", () => {
    it("keeps the guard when the read fails and nothing cleared the session", () => {
        assert.equal(
            deferredRestoreGuardAction({
                lookup: { status: "failed" },
                liveHasQueue: true,
                clearEpochAtStart: 1,
                clearEpochNow: 1,
            }),
            "keep-guard"
        )
    })

    it("clears without marking when the read fails after /stop advanced the epoch", () => {
        assert.equal(
            deferredRestoreGuardAction({
                lookup: { status: "failed" },
                liveHasQueue: true,
                clearEpochAtStart: 1,
                clearEpochNow: 2,
            }),
            "clear"
        )
    })
})

describe("releaseDeferredRestoreGuards", () => {
    it("keeps the failed guild guarded when the epoch is unchanged and still clears the next guild", async () => {
        const cleared: string[] = []
        const marked: string[] = []
        const errors: string[] = []
        await releaseDeferredRestoreGuards({
            guildIds: ["a", "b", "c"],
            deferredGuildIds: new Set(["a", "b", "c"]),
            readSession: async (guildId) => {
                if (guildId === "b") throw new Error("db down")
                return { guildId }
            },
            liveHasQueue: () => true,
            clearEpochAtStart: () => 0,
            clearEpochNow: () => 0,
            markPreservePrior: (guildId) => marked.push(guildId),
            clearRestoreInProgress: (guildId) => cleared.push(guildId),
            onLookupError: (guildId) => errors.push(guildId),
            sessionReadAttempts: 1,
        })
        assert.deepEqual(cleared, ["a", "c"])
        assert.deepEqual(marked, ["a", "c"])
        assert.deepEqual(errors, ["b"])
    })

    it("clears the failed guild without marking when the epoch advanced", async () => {
        const cleared: string[] = []
        const marked: string[] = []
        await releaseDeferredRestoreGuards({
            guildIds: ["a", "b"],
            deferredGuildIds: new Set(["a", "b"]),
            readSession: async (guildId) => {
                if (guildId === "b") throw new Error("db down")
                return { guildId }
            },
            liveHasQueue: () => true,
            clearEpochAtStart: (guildId) => (guildId === "b" ? 1 : 0),
            clearEpochNow: (guildId) => (guildId === "b" ? 2 : 0),
            markPreservePrior: (guildId) => marked.push(guildId),
            clearRestoreInProgress: (guildId) => cleared.push(guildId),
            onLookupError: () => undefined,
            sessionReadAttempts: 1,
        })
        assert.deepEqual(cleared, ["a", "b"])
        assert.deepEqual(marked, ["a"])
    })

    it("treats a later successful read as resolved", async () => {
        const marked: string[] = []
        const cleared: string[] = []
        let tries = 0
        await releaseDeferredRestoreGuards({
            guildIds: ["a"],
            deferredGuildIds: new Set(["a"]),
            readSession: async () => {
                tries += 1
                if (tries < 3) throw new Error("blip")
                return { guildId: "a" }
            },
            liveHasQueue: () => true,
            clearEpochAtStart: () => 0,
            clearEpochNow: () => 0,
            markPreservePrior: (guildId) => marked.push(guildId),
            clearRestoreInProgress: (guildId) => cleared.push(guildId),
            onLookupError: () => undefined,
        })
        assert.equal(tries, 3)
        assert.deepEqual(marked, ["a"])
        assert.deepEqual(cleared, ["a"])
    })
})

describe("guildIdsNeedingRestoreSaveGuard", () => {
    it("marks every persisted guild before sequential restore (not only the current one)", () => {
        assert.deepEqual(guildIdsNeedingRestoreSaveGuard([{ guildId: "a" }, { guildId: "b" }]), [
            "a",
            "b",
        ])
    })

    it("dedupes guild ids so a guild is guarded once", () => {
        assert.deepEqual(guildIdsNeedingRestoreSaveGuard([{ guildId: "g" }, { guildId: "g" }]), [
            "g",
        ])
    })
})

describe("shouldAbandonRestoreForConcurrentQueue", () => {
    it("keeps the player when upcoming tracks were enqueued during resolve", () => {
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { current: null, tracks: [{ id: "a" }] },
            }),
            true
        )
    })

    it("keeps the player when a current track is already playing", () => {
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { current: { id: "now" }, tracks: [] },
            }),
            true
        )
    })

    it("allows destroy/delete when the hydrate player is still empty", () => {
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { current: null, tracks: [] },
            }),
            false
        )
        assert.equal(
            shouldAbandonRestoreForConcurrentQueue({
                queue: { tracks: [] },
            }),
            false
        )
    })
})

describe("isRestoreHydratePlayerStillLive", () => {
    it("is true only for the same Player instance still in the manager", () => {
        const restore = { id: "restore" }
        const successor = { id: "successor" }

        assert.equal(isRestoreHydratePlayerStillLive(restore, restore), true)
        assert.equal(isRestoreHydratePlayerStillLive(restore, successor), false)
        assert.equal(isRestoreHydratePlayerStillLive(restore, null), false)
        assert.equal(isRestoreHydratePlayerStillLive(restore, undefined), false)
    })

    it("rejects empty-queue concurrent check alone as insufficient for successor races", () => {
        // /stop+/play during resolve: zombie restore Player has empty queue, so
        // shouldAbandonRestoreForConcurrentQueue is false — identity gate is required.
        const zombie = { queue: { current: null, tracks: [] as unknown[] } }
        assert.equal(shouldAbandonRestoreForConcurrentQueue(zombie), false)
        assert.equal(isRestoreHydratePlayerStillLive(zombie, { id: "successor" }), false)
    })
})

describe("shouldDeleteStaleRestoredSession", () => {
    const evaluated = {
        voiceChannelId: "vc-old",
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    }

    it("deletes when the DB row is still the evaluated stale session", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: { ...evaluated },
                livePlayerExists: false,
            }),
            true
        )
    })

    it("skips delete when a live player already owns the guild", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: { ...evaluated },
                livePlayerExists: true,
            }),
            false
        )
    })

    it("skips delete when a successor session replaced the row during fetch", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: {
                    voiceChannelId: "vc-new",
                    updatedAt: new Date("2026-08-01T00:01:00.000Z"),
                },
                livePlayerExists: false,
            }),
            false
        )
    })

    it("skips delete when the row was already cleared", () => {
        assert.equal(
            shouldDeleteStaleRestoredSession({
                evaluated,
                latest: null,
                livePlayerExists: false,
            }),
            false
        )
    })
})
