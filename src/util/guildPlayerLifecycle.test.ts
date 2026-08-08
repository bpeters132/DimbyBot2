import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    acquireGuildPlayerLifecycleReservation,
    getGuildPlayerLifecycleReservationCount,
    hasPendingOrphanDestroyForTests,
    tryDestroyOrphanGuildPlayer,
    waitForPendingOrphanDestroyForTests,
    withGuildPlayerLifecycleReservation,
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

    it("withGuildPlayerLifecycleReservation always releases after work", async () => {
        const guildId = "guild-with-reserve"
        await withGuildPlayerLifecycleReservation(guildId, async () => {
            assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 1)
        })
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 0)
    })

    it("withGuildPlayerLifecycleReservation releases when work throws", async () => {
        const guildId = "guild-with-reserve-throw"
        await assert.rejects(
            () =>
                withGuildPlayerLifecycleReservation(guildId, async () => {
                    assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 1)
                    throw new Error("boom")
                }),
            /boom/
        )
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 0)
    })

    it("defers orphan destroy while a Discord-style reservation is held without createdHere", async () => {
        // Models Discord /play (or restore) holding a reservation while web search cleanup runs.
        const guildId = "guild-discord-vs-web-orphan"
        let destroyed = false

        const discordPlay = await acquireGuildPlayerLifecycleReservation(guildId)
        const webSearch = await acquireGuildPlayerLifecycleReservation(guildId)

        await tryDestroyOrphanGuildPlayer(guildId, {
            hasQueueContent: () => false,
            destroyPlayer: async () => {
                destroyed = true
            },
        })
        assert.equal(destroyed, false)
        assert.equal(hasPendingOrphanDestroyForTests(guildId), true)

        webSearch.release()
        assert.equal(destroyed, false)
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 1)

        discordPlay.release()
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(destroyed, true)
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

    it("defers idle destroy when reservedByCaller is 0 and a reservation is held", async () => {
        const guildId = "guild-orphan-idle-timer"
        let destroyed = false

        const inFlight = await acquireGuildPlayerLifecycleReservation(guildId)

        // Idle teardown (queueEnd / trackError / alone-in-VC) does not itself hold a reservation.
        await tryDestroyOrphanGuildPlayer(
            guildId,
            {
                hasQueueContent: () => false,
                destroyPlayer: async () => {
                    destroyed = true
                },
            },
            0
        )
        assert.equal(destroyed, false)
        assert.equal(hasPendingOrphanDestroyForTests(guildId), true)

        inFlight.release()
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(destroyed, true)
        assert.equal(hasPendingOrphanDestroyForTests(guildId), false)
    })

    it("documents playlistPlay connectOnly gap: releasing before resolve lets deferred idle destroy run", async () => {
        // Models the pre-fix playlistPlay path: searchAndEnqueue(connectOnly) released its
        // lease, then a second acquire wrapped resolve. queueEnd idle destroy deferred during
        // connectOnly and ran on that release — plain destroy cleared the player/session while
        // playlistPlay still held a stale player reference.
        const guildId = "guild-playlist-connect-gap"
        let destroyed = false

        const connectOnlyLease = await acquireGuildPlayerLifecycleReservation(guildId)
        await tryDestroyOrphanGuildPlayer(
            guildId,
            {
                hasQueueContent: () => false,
                destroyPlayer: async () => {
                    destroyed = true
                },
            },
            0
        )
        assert.equal(hasPendingOrphanDestroyForTests(guildId), true)

        connectOnlyLease.release()
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(destroyed, true)

        // Too late: resolve/enqueue would run against a destroyed player / wiped session.
        const resolveLease = await acquireGuildPlayerLifecycleReservation(guildId)
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 1)
        resolveLease.release()
    })

    it("keeps deferred idle destroy blocked for continuous connect+resolve lease (playlistPlay fix)", async () => {
        const guildId = "guild-playlist-continuous-lease"
        let destroyed = false

        const continuousLease = await acquireGuildPlayerLifecycleReservation(guildId)

        // Idle timer during connectOnly (externalLifecycleReservation shares this lease).
        await tryDestroyOrphanGuildPlayer(
            guildId,
            {
                hasQueueContent: () => false,
                destroyPlayer: async () => {
                    destroyed = true
                },
            },
            0
        )
        assert.equal(destroyed, false)
        assert.equal(hasPendingOrphanDestroyForTests(guildId), true)

        // Still resolving/enqueueing under the same lease — destroy must not run.
        assert.equal(getGuildPlayerLifecycleReservationCount(guildId), 1)
        await Promise.resolve()
        assert.equal(destroyed, false)

        continuousLease.release()
        await waitForPendingOrphanDestroyForTests(guildId)
        assert.equal(destroyed, true)
    })
})
