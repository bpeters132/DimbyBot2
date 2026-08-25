import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import {
    markPlayerSessionRestoreInProgress,
    clearPlayerSessionRestoreInProgress,
    setPlayerSessionPersistenceDbForTests,
} from "./playerSessionPersistence.js"
import { destroyLavalinkPlayerForStop } from "./stopLavalinkPlayer.js"

afterEach(() => {
    setPlayerSessionPersistenceDbForTests(null)
})

describe("destroyLavalinkPlayerForStop", () => {
    it("awaits destroy so callers can catch failures", async () => {
        let resolved = false
        const player = {
            guildId: "guild-stop-await",
            destroy: async () => {
                await Promise.resolve()
                resolved = true
            },
        }
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async () => undefined,
            upsertPlayerSession: async () => undefined,
        })
        await destroyLavalinkPlayerForStop(player)
        assert.equal(resolved, true)
    })

    it("propagates destroy rejection to the caller (no floating promise)", async () => {
        const player = {
            guildId: "guild-stop-reject",
            destroy: async () => {
                throw new Error("node_unavailable")
            },
        }
        await assert.rejects(() => destroyLavalinkPlayerForStop(player), /node_unavailable/)
    })

    it("force-clears the session even while restore-in-progress (Leave parity)", async () => {
        const guildId = "guild-stop-restore"
        let deleted = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
            upsertPlayerSession: async () => undefined,
        })
        markPlayerSessionRestoreInProgress(guildId)
        try {
            await destroyLavalinkPlayerForStop({
                guildId,
                destroy: async () => undefined,
            })
            assert.equal(deleted, true)
        } finally {
            clearPlayerSessionRestoreInProgress(guildId)
        }
    })

    it("does not clear the session when destroy rejects", async () => {
        const guildId = "guild-stop-no-clear-on-fail"
        let deleted = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
            upsertPlayerSession: async () => undefined,
        })
        await assert.rejects(
            () =>
                destroyLavalinkPlayerForStop({
                    guildId,
                    destroy: async () => {
                        throw new Error("boom")
                    },
                }),
            /boom/
        )
        assert.equal(deleted, false)
    })
})
