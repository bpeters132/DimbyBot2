import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    mapGuildApiRouteGuardAccessDenied,
    mapGuildApiRouteGuardUnexpectedFailure,
} from "@/lib/guild-api-route-guard-failure.js"

describe("mapGuildApiRouteGuardAccessDenied", () => {
    it("forwards 401/403/503 access statuses instead of collapsing them to 500", () => {
        for (const status of [401, 403, 503] as const) {
            const mapped = mapGuildApiRouteGuardAccessDenied({
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
            assert.equal(typeof mapped.body.details, "string")
            assert.notEqual(mapped.status, 500)
            assert.notEqual(mapped.body.error, "Internal error")
        }
    })

    it("omits details when the access denial has none", () => {
        const mapped = mapGuildApiRouteGuardAccessDenied({
            status: 401,
            error: "Unauthorized",
        })
        assert.equal(mapped.body.details, undefined)
        assert.equal(mapped.status, 401)
    })
})

describe("mapGuildApiRouteGuardUnexpectedFailure", () => {
    it("maps an unexpected throw to 500 with INTERNAL_ERROR details, not an access-denial status", () => {
        const mapped = mapGuildApiRouteGuardUnexpectedFailure()
        assert.deepEqual(mapped, {
            status: 500,
            body: {
                ok: false,
                status: 500,
                error: "Internal error",
                details: { code: "INTERNAL_ERROR" },
            },
        })
        assert.notEqual(mapped.status, 401)
        assert.notEqual(mapped.status, 403)
        assert.notEqual(mapped.status, 503)
        assert.equal(typeof mapped.body.details, "object")
        assert.notEqual(typeof mapped.body.details, "string")
    })
})
