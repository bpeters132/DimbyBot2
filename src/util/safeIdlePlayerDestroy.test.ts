import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { safeIdlePlayerDestroy } from "./safeIdlePlayerDestroy.js"
import {
    acquireGuildPlayerLifecycleReservation,
    waitForPendingOrphanDestroyForTests,
} from "./guildPlayerQueueLock.js"

describe("safeIdlePlayerDestroy", () => {
    it("swallows destroyPlayer throws so idle timers cannot surface unhandled rejections", async () => {
        const guildId = `safe-idle-destroy-${Date.now()}`
        const errors: unknown[] = []
        await safeIdlePlayerDestroy(
            guildId,
            {
                hasQueueContent: () => false,
                destroyPlayer: async () => {
                    throw new Error("lavalink node gone")
                },
            },
            (err) => errors.push(err)
        )
        assert.equal(errors.length, 1)
        assert.match(String(errors[0]), /lavalink node gone/)
    })

    it("still destroys when the player is idle and unreserved", async () => {
        const guildId = `safe-idle-ok-${Date.now()}`
        let destroyed = false
        await safeIdlePlayerDestroy(
            guildId,
            {
                hasQueueContent: () => false,
                destroyPlayer: async () => {
                    destroyed = true
                },
            },
            () => {
                assert.fail("onError should not run")
            }
        )
        assert.equal(destroyed, true)
    })

    it("defers while a lifecycle reservation is held, then runs after release", async () => {
        const guildId = `safe-idle-defer-${Date.now()}`
        const lease = await acquireGuildPlayerLifecycleReservation(guildId)
        let destroyed = false
        await safeIdlePlayerDestroy(
            guildId,
            {
                hasQueueContent: () => false,
                destroyPlayer: async () => {
                    destroyed = true
                },
            },
            () => {
                assert.fail("onError should not run")
            }
        )
        assert.equal(destroyed, false)
        lease.release()
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(destroyed, true)
    })
})
