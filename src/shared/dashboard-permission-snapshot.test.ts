import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { WebPermission } from "./permissions.js"
import { normalizeDashboardPermissionSnapshotResponse } from "./dashboard-permission-snapshot.js"

describe("normalizeDashboardPermissionSnapshotResponse", () => {
    it("rejects non-object and missing-ok payloads", () => {
        assert.deepEqual(normalizeDashboardPermissionSnapshotResponse(null, 200), {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "The bot API returned an unexpected payload for dashboard permissions.",
        })
        const missingOk = normalizeDashboardPermissionSnapshotResponse({}, 404)
        assert.equal(missingOk.ok, false)
        if (missingOk.ok === false) assert.equal(missingOk.status, 404)
        assert.equal(normalizeDashboardPermissionSnapshotResponse({ ok: "yes" }, 200).ok, false)
    })

    it("maps ok:false with nested error shapes and status fallback", () => {
        assert.deepEqual(
            normalizeDashboardPermissionSnapshotResponse(
                {
                    ok: false,
                    status: 403.9,
                    error: { error: "Forbidden", details: "no access" },
                },
                200
            ),
            {
                ok: false,
                status: 403,
                error: "Forbidden",
                details: "no access",
            }
        )
        const fromHttp = normalizeDashboardPermissionSnapshotResponse(
            { ok: false, error: "boom" },
            503
        )
        assert.equal(fromHttp.ok, false)
        if (fromHttp.ok === false) assert.equal(fromHttp.status, 503)
        const defaultStatus = normalizeDashboardPermissionSnapshotResponse({ ok: false }, 200)
        assert.equal(defaultStatus.ok, false)
        if (defaultStatus.ok === false) assert.equal(defaultStatus.status, 502)
    })

    it("accepts a valid success snapshot including optimisticBotUnavailable", () => {
        const result = normalizeDashboardPermissionSnapshotResponse(
            {
                ok: true,
                discordUserId: "123456789012345678",
                snapshot: {
                    memberResolved: 1,
                    primaryPermissions: [WebPermission.VIEW_PLAYER],
                    oauthPermissions: [WebPermission.MANAGE_QUEUE],
                    optimisticBotUnavailable: true,
                },
            },
            200
        )
        assert.deepEqual(result, {
            ok: true,
            discordUserId: "123456789012345678",
            snapshot: {
                memberResolved: true,
                primaryPermissions: [WebPermission.VIEW_PLAYER],
                oauthPermissions: [WebPermission.MANAGE_QUEUE],
                optimisticBotUnavailable: true,
            },
        })
    })

    it("rejects missing discordUserId, snapshot, or invalid permission arrays", () => {
        assert.match(
            (
                normalizeDashboardPermissionSnapshotResponse(
                    { ok: true, snapshot: { primaryPermissions: [], oauthPermissions: [] } },
                    200
                ) as { details?: string }
            ).details ?? "",
            /discordUserId/
        )
        assert.match(
            (
                normalizeDashboardPermissionSnapshotResponse(
                    { ok: true, discordUserId: "1" },
                    200
                ) as { details?: string }
            ).details ?? "",
            /snapshot/
        )
        assert.match(
            (
                normalizeDashboardPermissionSnapshotResponse(
                    {
                        ok: true,
                        discordUserId: "1",
                        snapshot: {
                            memberResolved: false,
                            primaryPermissions: ["NOT_A_REAL_PERM"],
                            oauthPermissions: [],
                        },
                    },
                    200
                ) as { details?: string }
            ).details ?? "",
            /invalid permission arrays/i
        )
    })
})
