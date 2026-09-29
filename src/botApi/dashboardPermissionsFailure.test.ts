import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    mapDashboardPermissionsAccessDenied,
    mapDashboardPermissionsBotNotReady,
} from "./dashboardPermissionsFailure.js"

describe("mapDashboardPermissionsAccessDenied", () => {
    it("preserves 401/403/503 access statuses instead of collapsing them to bot-not-ready", () => {
        for (const status of [401, 403, 503] as const) {
            const mapped = mapDashboardPermissionsAccessDenied({
                status,
                error: status === 401 ? "Unauthorized" : "Forbidden",
                details: "access denied",
            })
            assert.equal(mapped.status, status)
            assert.deepEqual(mapped.body, {
                ok: false,
                status,
                error: status === 401 ? "Unauthorized" : "Forbidden",
                details: "access denied",
            })
        }
    })

    it("omits details when the access denial has none", () => {
        const mapped = mapDashboardPermissionsAccessDenied({
            status: 401,
            error: "Unauthorized",
        })
        assert.equal(mapped.body.details, undefined)
        assert.equal(mapped.status, 401)
    })
})

describe("mapDashboardPermissionsBotNotReady", () => {
    it("returns 503 with bot-starting copy, not an access-denial status", () => {
        const mapped = mapDashboardPermissionsBotNotReady()
        assert.equal(mapped.status, 503)
        assert.deepEqual(mapped.body, {
            ok: false,
            status: 503,
            error: "Bot not ready",
            details: "The Discord bot is still starting; try again in a few seconds.",
        })
        assert.notEqual(mapped.body.error, "Unauthorized")
        assert.notEqual(mapped.body.error, "Forbidden")
    })
})
