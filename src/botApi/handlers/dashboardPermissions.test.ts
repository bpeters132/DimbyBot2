import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const state = {
    access: {
        ok: true as const,
        discordUserId: "100000000000000002",
        session: { user: { id: "u" } },
    } as
        | { ok: true; discordUserId: string; session: { user: { id: string } } }
        | { ok: false; status: number; error: string; details?: string },
    snapshot: {
        ok: true as const,
        snapshot: { canView: true },
        discordUserId: "100000000000000002",
    } as {
        ok: boolean
        status?: number
        error?: string
        snapshot?: unknown
        discordUserId?: string
    },
    botThrows: false,
}

mock.module("../../shared/api-auth.js", {
    namedExports: {
        resolveAuthenticatedGuildAccess: async () => state.access,
        finishGuildDashboardPermissionSnapshot: async () => state.snapshot,
    },
})

mock.module("../../lib/botClientRegistry.js", {
    namedExports: {
        getBotClient: () => {
            if (state.botThrows) throw new Error("Bot client is not initialized yet.")
            return { id: "bot" }
        },
    },
})

const { dashboardPermissionsGET } = await import("./dashboardPermissions.js")

describe("dashboardPermissionsGET", () => {
    it("returns the guild access denial", async () => {
        state.access = { ok: false, status: 403, error: "Forbidden", details: "Not a member." }
        const result = await dashboardPermissionsGET(new Headers(), "100000000000000001")
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error, "Forbidden")
        state.access = {
            ok: true,
            discordUserId: "100000000000000002",
            session: { user: { id: "u" } },
        }
    })

    it("returns 503 when the bot client is not ready", async () => {
        state.botThrows = true
        const result = await dashboardPermissionsGET(new Headers(), "100000000000000001")
        assert.equal(result.status, 503)
        assert.equal(result.body.ok === false && result.body.error, "Bot not ready")
        state.botThrows = false
    })

    it("returns the permission snapshot", async () => {
        const result = await dashboardPermissionsGET(new Headers(), "100000000000000001")
        assert.equal(result.status, 200)
        assert.equal(result.body.ok, true)
    })

    it("returns the snapshot failure status", async () => {
        state.snapshot = { ok: false, status: 403, error: "Missing permission" }
        const result = await dashboardPermissionsGET(new Headers(), "100000000000000001")
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error, "Missing permission")
    })
})
