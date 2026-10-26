import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    mapDiscordAccountRequiredFailure,
    mapMissingRequiredPermissions,
    mapPermissionResolutionUnavailable,
} from "../../src/shared/permission-guard-http.js"

describe("mapPermissionResolutionUnavailable", () => {
    it("maps a permission-resolution throw to 503 so callers retry, not Forbidden", () => {
        const mapped = mapPermissionResolutionUnavailable()
        assert.deepEqual(mapped, {
            ok: false,
            status: 503,
            error: "Service Unavailable",
            details:
                "Permission resolution is temporarily unavailable. Please retry in a moment or re-open the dashboard.",
        })
        assert.notEqual(mapped.status, 403)
        assert.notEqual(mapped.error, "Forbidden")
    })
})

describe("mapMissingRequiredPermissions", () => {
    it("maps missing role entitlements to 403, not a retryable 503", () => {
        const mapped = mapMissingRequiredPermissions()
        assert.deepEqual(mapped, {
            ok: false,
            status: 403,
            error: "Forbidden",
            details:
                "You do not have permission for this action in this server (your Discord role may not include the required abilities).",
        })
        assert.notEqual(mapped.status, 503)
        assert.notEqual(mapped.error, "Service Unavailable")
    })
})

describe("mapDiscordAccountRequiredFailure", () => {
    it("maps a thrown Discord id lookup to 403 without details, not 401 or 503", () => {
        assert.deepEqual(mapDiscordAccountRequiredFailure("resolve_failed"), {
            ok: false,
            status: 403,
            error: "Discord account required",
        })
        assert.equal(mapDiscordAccountRequiredFailure("resolve_failed").details, undefined)
        assert.notEqual(mapDiscordAccountRequiredFailure("resolve_failed").status, 401)
        assert.notEqual(mapDiscordAccountRequiredFailure("resolve_failed").status, 503)
    })

    it("maps a missing Discord snowflake to 403 with sign-in details", () => {
        const mapped = mapDiscordAccountRequiredFailure("missing")
        assert.equal(mapped.status, 403)
        assert.equal(mapped.error, "Discord account required")
        assert.match(mapped.details ?? "", /Discord user id/)
        assert.match(mapped.details ?? "", /Sign in with Discord/)
        assert.notEqual(mapped.status, 401)
        assert.notEqual(mapped.error, "Unauthorized")
    })
})
