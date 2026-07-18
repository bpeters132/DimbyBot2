import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    acquireGuildPlayerLifecycleReservation,
    getGuildPlayerLifecycleReservationCount,
} from "./guildPlayerQueueLock.js"

describe("guild player lifecycle reservation", () => {
    it("tracks concurrent reservations and releases independently", () => {
        const a = acquireGuildPlayerLifecycleReservation("guild-life")
        const b = acquireGuildPlayerLifecycleReservation("guild-life")
        assert.equal(getGuildPlayerLifecycleReservationCount("guild-life"), 2)
        a.release()
        assert.equal(getGuildPlayerLifecycleReservationCount("guild-life"), 1)
        // Orphan cleanup would skip destroy while count > 1; after one release, only one remains.
        assert.ok(getGuildPlayerLifecycleReservationCount("guild-life") > 0)
        b.release()
        assert.equal(getGuildPlayerLifecycleReservationCount("guild-life"), 0)
    })
})
