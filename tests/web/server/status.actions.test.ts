import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"

const payload = {
    ok: true,
    checkedAt: "2026-01-01T00:00:00.000Z",
    database: { ok: true, message: "up" },
    botApi: { ok: true, message: "up" },
}

const state = {
    probeThrows: false,
    auditThrows: false,
}

mock.module("@/server/service-status", {
    namedExports: {
        getServiceStatusPayload: async () => {
            if (state.probeThrows) throw new Error("probe down")
            return payload
        },
    },
})

mock.module("@/lib/audit-log", {
    namedExports: {
        writeAuditLog: () => {
            if (state.auditThrows) throw new Error("audit down")
        },
    },
})

const { getServiceStatusAction } = await import("../../../src/web/server/status.actions.js")

describe("getServiceStatusAction", () => {
    it("returns the probe payload", async () => {
        state.probeThrows = false
        state.auditThrows = false
        const result = await getServiceStatusAction()
        assert.equal(result.ok, true)
        if (result.ok) assert.equal(result.database.message, "up")
    })

    it("returns a failed probe when the status load throws", async () => {
        state.probeThrows = true
        const result = await getServiceStatusAction()
        assert.equal(result.ok, false)
        assert.equal(result.database.message, "Status probe failed")
        assert.equal(result.botApi.message, "Status probe failed")
        state.probeThrows = false
    })

    it("still returns the failed probe when the audit log throws", async () => {
        state.probeThrows = true
        state.auditThrows = true
        const result = await getServiceStatusAction()
        assert.equal(result.database.message, "Status probe failed")
        assert.equal(result.botApi.message, "Status probe failed")
    })
})
