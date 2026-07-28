import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decideAdminAccess } from "../shared/admin-access-decision.js"

describe("decideAdminAccess", () => {
    it("returns 503 when session load fails", () => {
        assert.deepEqual(
            decideAdminAccess({
                sessionLoadFailed: true,
                hasSessionUser: false,
                discordUserId: null,
                ownerId: "owner-1",
            }),
            {
                ok: false,
                status: 503,
                error: "Service Unavailable",
                details: "Could not load your session. Please try again later.",
            }
        )
    })

    it("returns 401 without a session user", () => {
        assert.deepEqual(
            decideAdminAccess({
                hasSessionUser: false,
                discordUserId: null,
                ownerId: "owner-1",
            }),
            { ok: false, status: 401, error: "Unauthorized" }
        )
    })

    it("returns 403 when Discord resolution fails or yields no snowflake", () => {
        assert.equal(
            decideAdminAccess({
                hasSessionUser: true,
                discordResolveFailed: true,
                discordUserId: null,
                ownerId: "owner-1",
            }).ok,
            false
        )
        const missing = decideAdminAccess({
            hasSessionUser: true,
            discordUserId: null,
            ownerId: "owner-1",
        })
        assert.equal(missing.ok, false)
        if (missing.ok) return
        assert.equal(missing.status, 403)
        assert.equal(missing.error, "Discord account required")
    })

    it("returns 403 when OWNER_ID is unset or the caller is not the owner", () => {
        assert.deepEqual(
            decideAdminAccess({
                hasSessionUser: true,
                discordUserId: "user-2",
                ownerId: undefined,
            }),
            {
                ok: false,
                status: 403,
                error: "Forbidden",
                details: "Developer access required.",
            }
        )
        assert.deepEqual(
            decideAdminAccess({
                hasSessionUser: true,
                discordUserId: "user-2",
                ownerId: "owner-1",
            }),
            {
                ok: false,
                status: 403,
                error: "Forbidden",
                details: "Developer access required.",
            }
        )
    })

    it("allows the owner when session and Discord id resolve", () => {
        assert.deepEqual(
            decideAdminAccess({
                hasSessionUser: true,
                discordUserId: "owner-1",
                ownerId: "owner-1",
            }),
            { ok: true, discordUserId: "owner-1" }
        )
    })
})
