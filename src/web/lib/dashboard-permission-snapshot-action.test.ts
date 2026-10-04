import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapGuildDashboardSnapshotActionFailure } from "@/lib/dashboard-permission-snapshot-action.js"

describe("mapGuildDashboardSnapshotActionFailure", () => {
    it("maps a non-snowflake guild id to HTTP 400", () => {
        assert.deepEqual(mapGuildDashboardSnapshotActionFailure("invalid_guild"), {
            ok: false,
            status: 400,
            error: "Invalid guild id",
            details: "Expected a non-empty Discord snowflake (numeric id).",
        })
    })

    it("maps an unexpected snapshot throw to 503 Service unavailable", () => {
        const crash = mapGuildDashboardSnapshotActionFailure("snapshot_throw")
        assert.deepEqual(crash, {
            ok: false,
            status: 503,
            error: "Service unavailable",
            details: "Could not load permission snapshot. Try again later.",
        })
        assert.notEqual(crash.error, "Bot API unreachable")
        assert.notEqual(crash.error, "Bot API not configured")
        assert.notEqual(crash.error, "Bot API misconfigured")
        assert.notEqual(crash.error, "Permission check unavailable")
    })

    it("does not collapse invalid guild ids into a retryable 503", () => {
        const invalid = mapGuildDashboardSnapshotActionFailure("invalid_guild")
        const crash = mapGuildDashboardSnapshotActionFailure("snapshot_throw")
        assert.equal(invalid.status, 400)
        assert.equal(crash.status, 503)
        assert.notEqual(invalid.error, crash.error)
    })
})
