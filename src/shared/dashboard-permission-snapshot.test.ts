import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { WebPermission } from "./permissions.js"
import {
    applyPermissionSnapshotSessionCheck,
    dashboardPermissionSnapshotUpstreamStatus,
    mapDashboardPermissionSnapshotMalformedJson,
    mapDashboardPermissionSnapshotNonJsonResponse,
    mapDashboardPermissionSnapshotOriginFailure,
    mapDashboardPermissionSnapshotResolutionFailure,
    mapDashboardPermissionSnapshotUnreachable,
    normalizeDashboardPermissionSnapshotResponse,
} from "./dashboard-permission-snapshot.js"

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

    it("fail-closes ok:false statuses outside HTTP 400–599 to 502", () => {
        for (const status of [200, 399, 0, -1, 600, 999]) {
            const out = normalizeDashboardPermissionSnapshotResponse(
                { ok: false, status, error: "x" },
                404
            )
            assert.equal(out.ok, false)
            if (out.ok === false) assert.equal(out.status, 502)
        }
        const nonFinite = normalizeDashboardPermissionSnapshotResponse(
            { ok: false, status: Number.NaN, error: "x" },
            200
        )
        assert.equal(nonFinite.ok, false)
        if (nonFinite.ok === false) assert.equal(nonFinite.status, 502)
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

describe("applyPermissionSnapshotSessionCheck", () => {
    const snapshot = {
        memberResolved: false,
        primaryPermissions: [WebPermission.VIEW_PLAYER],
        oauthPermissions: [],
    }

    it("returns the upstream snapshot when discordUserId matches the session", () => {
        const upstream = {
            ok: true as const,
            discordUserId: "111",
            snapshot,
        }
        assert.equal(applyPermissionSnapshotSessionCheck("111", upstream), upstream)
    })

    it("fail-closes to 403 when the snapshot is for a different Discord user", () => {
        assert.deepEqual(
            applyPermissionSnapshotSessionCheck("111", {
                ok: true,
                discordUserId: "222",
                snapshot,
            }),
            {
                ok: false,
                status: 403,
                error: "Forbidden",
                details: "Permission snapshot could not be verified for this session.",
            }
        )
    })

    it("does not rewrite an upstream failure as Forbidden", () => {
        const upstream = {
            ok: false as const,
            status: 503,
            error: "Bot API unreachable",
        }
        assert.equal(applyPermissionSnapshotSessionCheck("111", upstream), upstream)
    })
})

describe("mapDashboardPermissionSnapshotOriginFailure", () => {
    it("maps invalid vs unset API_PROXY_TARGET to distinct 503 copy", () => {
        assert.deepEqual(mapDashboardPermissionSnapshotOriginFailure("invalid"), {
            ok: false,
            status: 503,
            error: "Bot API misconfigured",
            details:
                "API_PROXY_TARGET is invalid. Set it to the bot HTTP origin (origin only, no path).",
        })
        const unset = mapDashboardPermissionSnapshotOriginFailure("unset")
        assert.deepEqual(unset, {
            ok: false,
            status: 503,
            error: "Bot API not configured",
            details:
                "Set API_PROXY_TARGET to your bot HTTP origin (e.g. http://localhost:3001 locally, or http://dimbybot:3001 in Docker).",
        })
        assert.notEqual(mapDashboardPermissionSnapshotOriginFailure("invalid").error, unset.error)
    })
})

describe("mapDashboardPermissionSnapshotUnreachable", () => {
    it("keeps a thrown upstream fetch as 503, not the serverFetchBot 502", () => {
        const out = mapDashboardPermissionSnapshotUnreachable()
        assert.deepEqual(out, {
            ok: false,
            status: 503,
            error: "Bot API unreachable",
            details:
                "Could not reach the bot HTTP server for permission data. Confirm the bot is running and API_PROXY_TARGET matches BOT_API_PORT.",
        })
        assert.notEqual(out.status, 502)
        assert.notEqual(out.error, "Bot API misconfigured")
        assert.notEqual(out.error, "Bot API not configured")
    })
})

describe("dashboardPermissionSnapshotUpstreamStatus", () => {
    it("preserves 4xx/5xx and collapses success-range statuses to 502", () => {
        assert.equal(dashboardPermissionSnapshotUpstreamStatus(404), 404)
        assert.equal(dashboardPermissionSnapshotUpstreamStatus(500), 500)
        assert.equal(dashboardPermissionSnapshotUpstreamStatus(200), 502)
        assert.equal(dashboardPermissionSnapshotUpstreamStatus(0), 502)
    })
})

describe("mapDashboardPermissionSnapshotNonJsonResponse", () => {
    it("keeps HTTP 404 copy for an older bot build missing the route", () => {
        assert.deepEqual(mapDashboardPermissionSnapshotNonJsonResponse(404), {
            ok: false,
            status: 404,
            error: "Dashboard permission route not found",
            details:
                "The bot process may be running an older build without GET /api/guilds/:guildId/dashboard-permissions — rebuild the bot (yarn build:bot) and restart it.",
        })
    })

    it("maps other non-JSON responses to Invalid bot response and 502 when HTTP is ok", () => {
        assert.deepEqual(mapDashboardPermissionSnapshotNonJsonResponse(200), {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "Expected JSON from the bot API for dashboard permissions.",
        })
        const serverError = mapDashboardPermissionSnapshotNonJsonResponse(500)
        assert.equal(serverError.status, 500)
        assert.equal(serverError.error, "Invalid bot response")
        assert.notEqual(serverError.error, "Dashboard permission route not found")
    })
})

describe("mapDashboardPermissionSnapshotMalformedJson", () => {
    it("keeps the HTTP status when it is an error and uses 502 otherwise", () => {
        assert.deepEqual(mapDashboardPermissionSnapshotMalformedJson(502), {
            ok: false,
            status: 502,
            error: "Invalid bot response",
            details: "The bot API returned malformed JSON for dashboard permissions.",
        })
        assert.equal(mapDashboardPermissionSnapshotMalformedJson(200).status, 502)
        assert.equal(mapDashboardPermissionSnapshotMalformedJson(404).status, 404)
        assert.notEqual(
            mapDashboardPermissionSnapshotMalformedJson(404).error,
            "Dashboard permission route not found"
        )
    })
})

describe("mapDashboardPermissionSnapshotResolutionFailure", () => {
    it("maps an in-process permission throw to 503 Permission check unavailable", () => {
        const out = mapDashboardPermissionSnapshotResolutionFailure()
        assert.deepEqual(out, {
            ok: false,
            status: 503,
            error: "Permission check unavailable",
            details:
                "Could not load dashboard permissions for this server. Try again shortly or refresh the page.",
        })
        assert.notEqual(out.error, "Bot not ready")
        assert.notEqual(out.error, "Service unavailable")
        assert.notEqual(out.error, "Bot API unreachable")
    })
})
