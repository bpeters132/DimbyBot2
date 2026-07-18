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
    it("tracks concurrent reservations and releases independently", async () => {
        const a = await acquireGuildPlayerLifecycleReservation("guild-life")
        const b = await acquireGuildPlayerLifecycleReservation("guild-life")
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

        const creator = await acquireGuildPlayerLifecycleReservation(guildId)
        const other = await acquireGuildPlayerLifecycleReservation(guildId)

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

        const creator = await acquireGuildPlayerLifecycleReservation(guildId)
        const other = await acquireGuildPlayerLifecycleReservation(guildId)

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

    it("blocks new reservations while destroyPlayer is in progress", async () => {
        const guildId = "guild-orphan-serialize"
        let releaseDestroy!: () => void
        const destroyGate = new Promise<void>((resolve) => {
            releaseDestroy = resolve
        })
        let destroyEntered = false
        let reservedDuringDestroy = false

        const holder = await acquireGuildPlayerLifecycleReservation(guildId)

        const destroyP = tryDestroyOrphanGuildPlayer(guildId, {
            hasQueueContent: () => false,
            destroyPlayer: async () => {
                destroyEntered = true
                await destroyGate
            },
        })

        while (!destroyEntered) {
            await Promise.resolve()
        }

        const acquireP = acquireGuildPlayerLifecycleReservation(guildId).then((lease) => {
            reservedDuringDestroy = true
            return lease
        })

        await Promise.resolve()
        await Promise.resolve()
        assert.equal(reservedDuringDestroy, false)
        // Holder still counts; acquire must not have granted yet while destroy holds the lock.
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 1)

        releaseDestroy()
        await destroyP
        const next = await acquireP
        assert.equal(reservedDuringDestroy, true)
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 2)
        next.release()
        holder.release()
        await waitForPendingOrphanDestroyForTests(guildId)
    })
})
