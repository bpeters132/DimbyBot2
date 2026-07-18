import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    acquireGuildPlayerLifecycleReservation,
    getGuildPlayerLifecycleReservationCount,
    hasPendingOrphanDestroyForTests,
    tryDestroyOrphanGuildPlayer,
    waitForPendingOrphanDestroyForTests,
} from "./guildPlayerQueueLock.js"

describe("guild player lifecycle reservation", () => {
    it("tracks concurrent reservations and releases independently", () => {
        const a = acquireGuildPlayerLifecycleReservation("guild-life")
        const b = acquireGuildPlayerLifecycleReservation("guild-life")
        assert.equal(getGuildPlayerLifecycleReservationCount("guild-life"), 2)
        a.release()
        assert.equal(getGuildPlayerLifecycleReservationCount("guild-life"), 1)
        assert.ok(getGuildPlayerLifecycleReservationCount("guild-life") > 0)
        b.release()
        assert.equal(getGuildPlayerLifecycleReservationCount("guild-life"), 0)
    })
})

describe("deferred orphan player cleanup", () => {
    it("destroys an empty player after the other concurrent request finishes", async () => {
        const guildId = "guild-orphan-defer"
        let destroyed = false
        let hasContent = false

        const creator = acquireGuildPlayerLifecycleReservation(guildId)
        const other = acquireGuildPlayerLifecycleReservation(guildId)

        // Creator fails while the other request still holds a reservation → defer, do not destroy yet.
        await tryDestroyOrphanGuildPlayer(guildId, {
            hasQueueContent: () => hasContent,
            destroyPlayer: async () => {
                destroyed = true
            },
        })
        assert.equal(destroyed, false)
        assert.equal(hasPendingOrphanDestroyForTests(guildId), true)

        creator.release()
        assert.equal(destroyed, false)
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 1)

        // Other request also fails / finishes with an empty queue → deferred cleanup runs.
        other.release()
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(destroyed, true)
        assert.equal(hasPendingOrphanDestroyForTests(guildId), false)
    })

    it("skips deferred destroy when the player gained queue content before retry", async () => {
        const guildId = "guild-orphan-skip"
        let destroyed = false
        let hasContent = false

        const creator = acquireGuildPlayerLifecycleReservation(guildId)
        const other = acquireGuildPlayerLifecycleReservation(guildId)

        await tryDestroyOrphanGuildPlayer(guildId, {
            hasQueueContent: () => hasContent,
            destroyPlayer: async () => {
                destroyed = true
            },
        })
        assert.equal(hasPendingOrphanDestroyForTests(guildId), true)

        creator.release()
        hasContent = true
        other.release()
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(destroyed, false)
        assert.equal(hasPendingOrphanDestroyForTests(guildId), false)
    })
})
