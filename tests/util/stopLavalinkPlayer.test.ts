import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import {
    acquireGuildPlayerLifecycleReservation,
    waitForPendingOrphanDestroyForTests,
} from "../../src/util/guildPlayerQueueLock.js"
import {
    markPlayerSessionRestoreInProgress,
    clearPlayerSessionRestoreInProgress,
    setPlayerSessionPersistenceDbForTests,
} from "../../src/util/playerSessionPersistence.js"
import { destroyLavalinkPlayerForStop } from "../../src/util/stopLavalinkPlayer.js"

afterEach(() => {
    setPlayerSessionPersistenceDbForTests(null)
})

describe("destroyLavalinkPlayerForStop", () => {
    afterEach(() => {
        setPlayerSessionPersistenceDbForTests(null)
    })

    it("awaits destroy so callers can catch failures", async () => {
        let resolved = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async () => undefined,
        })
        const player = {
            guildId: "guild-stop-await",
            destroy: async () => {
                await Promise.resolve()
                resolved = true
            },
        }
        await destroyLavalinkPlayerForStop(player, () => player)
        assert.equal(resolved, true)
    })

    it("propagates destroy rejection to the caller (no floating promise)", async () => {
        const player = {
            guildId: "guild-stop-reject",
            destroy: async () => {
                throw new Error("node_unavailable")
            },
        }
        await assert.rejects(
            () => destroyLavalinkPlayerForStop(player, () => player),
            /node_unavailable/
        )
    })

    it("force-clears the session even while restore-in-progress when no successor", async () => {
        const guildId = "guild-stop-force-clear-restore"
        markPlayerSessionRestoreInProgress(guildId)
        let deleted = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
        })
        const player = {
            guildId,
            destroy: async () => undefined,
        }
        try {
            await destroyLavalinkPlayerForStop(player, () => null)
            assert.equal(deleted, true)
        } finally {
            clearPlayerSessionRestoreInProgress(guildId)
        }
    })

    it("does not force-clear when a successor is already live after destroy", async () => {
        const guildId = "guild-stop-skip-successor"
        const successor = { id: "successor" }
        let deleted = false
        let destroyed = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
        })
        await destroyLavalinkPlayerForStop(
            {
                guildId,
                destroy: async () => {
                    destroyed = true
                },
            },
            () => successor
        )
        assert.equal(destroyed, false)
        assert.equal(deleted, false)
    })

    it("does not clear the session when destroy rejects", async () => {
        const guildId = "guild-stop-no-clear-on-fail"
        let deleted = false
        const player = {
            guildId,
            destroy: async () => {
                throw new Error("boom")
            },
        }
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
            upsertPlayerSession: async () => undefined,
        })
        await assert.rejects(() => destroyLavalinkPlayerForStop(player, () => player), /boom/)
        assert.equal(deleted, false)
    })

    it("holds the queue lock through destroy so successor creation waits", async () => {
        const guildId = "guild-stop-destroy-serialize"
        let releaseDestroy!: () => void
        const destroyGate = new Promise<void>((resolve) => {
            releaseDestroy = resolve
        })
        let destroyEntered = false
        let sawSuccessorDuringDestroy = false
        let successorCreate!: Promise<void>

        // Same object identity as getLivePlayer's initial value (library Player.destroy).
        const player = {
            guildId,
            id: "stop-target",
            destroy: async () => {
                destroyEntered = true
                // Library destroy deletes the guild cache before awaiting node.destroyPlayer.
                live = null
                successorCreate = acquireGuildPlayerLifecycleReservation(guildId).then((lease) => {
                    live = { guildId, id: "successor" }
                    lease.release()
                })
                await Promise.resolve()
                await Promise.resolve()
                sawSuccessorDuringDestroy = live?.id === "successor"
                await destroyGate
            },
        }
        let live: { guildId: string; id: string } | null = player

        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async () => undefined,
        })

        const stopPromise = destroyLavalinkPlayerForStop(player, () => live)

        while (!destroyEntered) {
            await Promise.resolve()
        }

        releaseDestroy()
        await stopPromise
        // Reservation must not run while destroy holds the queue lock (force-clear after
        // the lock may already let the blocked create settle before stopPromise resolves).
        assert.equal(sawSuccessorDuringDestroy, false)
        await successorCreate
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(live?.id, "successor")
    })

    it("skips destroy when a different live player already owns the guild", async () => {
        const guildId = "guild-stop-stale-skip"
        const successor = { id: "successor" }
        let destroyed = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async () => undefined,
        })
        await destroyLavalinkPlayerForStop(
            {
                guildId,
                destroy: async () => {
                    destroyed = true
                },
            },
            () => successor
        )
        assert.equal(destroyed, false)
    })
})
