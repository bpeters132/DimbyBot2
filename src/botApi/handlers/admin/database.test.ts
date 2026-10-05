import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const state = {
    guard: { ok: true as const } as
        | { ok: true }
        | { ok: false; status: number; error: string; details?: string },
}

const counts = { sessions: 4, sessionsExpired: 1, verifications: 3, verificationsExpired: 2 }

mock.module("../../../shared/api-auth.js", {
    namedExports: {
        requireDeveloperAccess: async () => state.guard,
    },
})

mock.module("../../../lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            session: {
                count: async (args?: { where?: unknown }) =>
                    args?.where ? counts.sessionsExpired : counts.sessions,
                deleteMany: async () => ({ count: counts.sessionsExpired }),
            },
            verification: {
                count: async (args?: { where?: unknown }) =>
                    args?.where ? counts.verificationsExpired : counts.verifications,
                deleteMany: async () => ({ count: counts.verificationsExpired }),
            },
        }),
    },
})

const { adminDbStatsGET, adminDbCleanupPOST } = await import("./database.js")

describe("admin database handlers", () => {
    it("returns the developer access failure", async () => {
        state.guard = { ok: false, status: 403, error: "Forbidden" }
        const result = await adminDbStatsGET(new Headers())
        assert.equal(result.status, 403)
        assert.equal(result.body.ok === false && result.body.error.error, "Forbidden")
        state.guard = { ok: true }
    })

    it("returns session and verification counts", async () => {
        const result = await adminDbStatsGET(new Headers())
        assert.equal(result.status, 200)
        if (result.body.ok) {
            assert.equal(result.body.data.sessions.expired, 1)
            assert.equal(result.body.data.verifications.total, 3)
        }
    })

    it("returns 400 for an unknown cleanup target", async () => {
        const result = await adminDbCleanupPOST(
            new Headers(),
            { target: "users" },
            new URLSearchParams()
        )
        assert.equal(result.status, 400)
        assert.equal(result.body.ok === false && result.body.error.error, "Invalid request")
    })

    it("returns a dry-run cleanup count", async () => {
        const result = await adminDbCleanupPOST(
            new Headers(),
            { target: "all" },
            new URLSearchParams("dryRun=true")
        )
        assert.equal(result.status, 200)
        if (result.body.ok) {
            assert.equal(result.body.data.dryRun, true)
            assert.equal(result.body.data.deleted.sessions, 1)
            assert.equal(result.body.data.deleted.verifications, 2)
        }
    })

    it("returns deleted row counts", async () => {
        const result = await adminDbCleanupPOST(
            new Headers(),
            { target: "sessions" },
            new URLSearchParams()
        )
        assert.equal(result.status, 200)
        if (result.body.ok) {
            assert.equal(result.body.data.dryRun, false)
            assert.equal(result.body.data.deleted.sessions, 1)
        }
    })
})
