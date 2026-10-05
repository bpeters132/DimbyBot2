import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const GUILD = "100000000000000001"

const snapshot = {
    ok: true as const,
    discordUserId: "100000000000000002",
    snapshot: {
        memberResolved: true,
        primaryPermissions: ["VIEW_PLAYER"],
        oauthPermissions: [] as string[],
    },
}

const state = {
    mode: "ok" as "ok" | "throw" | "denied",
}

mock.module("next/headers", {
    namedExports: {
        headers: async () => new Headers(),
    },
})

mock.module("@/lib/api-auth", {
    namedExports: {
        getGuildDashboardPermissionSnapshot: async () => {
            if (state.mode === "throw") throw new Error("snapshot down")
            if (state.mode === "denied") {
                return {
                    ok: false as const,
                    status: 403,
                    error: "Missing permission",
                    details: "VIEW_PLAYER",
                }
            }
            return snapshot
        },
    },
})

const { getGuildDashboardSnapshotAction } = await import("./dashboard-permissions.actions.js")

describe("getGuildDashboardSnapshotAction", () => {
    it("rejects an invalid guild id", async () => {
        const result = await getGuildDashboardSnapshotAction("nope")
        assert.equal(result.ok, false)
        if (!result.ok) {
            assert.equal(result.status, 400)
            assert.equal(result.error, "Invalid guild id")
        }
    })

    it("returns the permission snapshot", async () => {
        state.mode = "ok"
        const result = await getGuildDashboardSnapshotAction(GUILD)
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.discordUserId, "100000000000000002")
    })

    it("returns service unavailable when the snapshot load throws", async () => {
        state.mode = "throw"
        const result = await getGuildDashboardSnapshotAction(GUILD)
        assert.equal(result.ok, false)
        if (!result.ok) {
            assert.equal(result.status, 503)
            assert.equal(result.error, "Service unavailable")
        }
    })

    it("returns the snapshot denial", async () => {
        state.mode = "denied"
        const result = await getGuildDashboardSnapshotAction(GUILD)
        assert.equal(result.ok, false)
        if (!result.ok) {
            assert.equal(result.status, 403)
            assert.equal(result.error, "Missing permission")
        }
    })
})
