import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
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
        await destroyLavalinkPlayerForStop(player, () => null)
        assert.equal(resolved, true)
    })

    it("propagates destroy rejection to the caller (no floating promise)", async () => {
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async () => undefined,
        })
        const player = {
            guildId: "guild-stop-reject",
            destroy: async () => {
                throw new Error("node_unavailable")
            },
        }
        await assert.rejects(
            () => destroyLavalinkPlayerForStop(player, () => null),
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
        try {
            await destroyLavalinkPlayerForStop(
                {
                    guildId,
                    destroy: async () => undefined,
                },
                () => null
            )
            assert.equal(deleted, true)
        } finally {
            clearPlayerSessionRestoreInProgress(guildId)
        }
    })

    it("does not force-clear when a successor is already live after destroy", async () => {
        const guildId = "guild-stop-skip-successor"
        const successor = { id: "successor" }
        let deleted = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
        })
        await destroyLavalinkPlayerForStop(
            {
                guildId,
                destroy: async () => undefined,
            },
            () => successor
        )
        assert.equal(deleted, false)
    })

    it("force-clears when destroy rejects after the manager slot is empty", async () => {
        // lavalink-client: deletePlayer then await node.destroyPlayer then emit playerDestroy.
        // When node.destroyPlayer throws, playerDestroy never runs — force-clear must still wipe.
        const guildId = "guild-stop-clear-on-fail-empty-slot"
        let deleted = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
            upsertPlayerSession: async () => undefined,
        })
        await assert.rejects(
            () =>
                destroyLavalinkPlayerForStop(
                    {
                        guildId,
                        destroy: async () => {
                            throw new Error("boom")
                        },
                    },
                    () => null
                ),
            /boom/
        )
        assert.equal(deleted, true)
    })

    it("does not force-clear when destroy rejects while the same player is still live", async () => {
        const guildId = "guild-stop-no-clear-on-fail-still-live"
        const stillLive = { id: "same-player" }
        let deleted = false
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async (id) => {
                if (id === guildId) deleted = true
            },
            upsertPlayerSession: async () => undefined,
        })
        await assert.rejects(
            () =>
                destroyLavalinkPlayerForStop(
                    {
                        guildId,
                        destroy: async () => {
                            throw new Error("disconnect_failed")
                        },
                    },
                    () => stillLive
                ),
            /disconnect_failed/
        )
        assert.equal(deleted, false)
    })
})
