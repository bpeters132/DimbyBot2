import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import { captureError, clearErrorHistory } from "../../../../src/lib/errorHistory.js"

const state = {
    guard: { ok: true as const } as
        | { ok: true }
        | { ok: false; status: number; error: string; details?: string },
}

mock.module("../../../../src/shared/api-auth.js", {
    namedExports: {
        requireDeveloperAccess: async () => state.guard,
    },
})

const { adminErrorsGET, adminErrorsDELETE } =
    await import("../../../../src/botApi/handlers/admin/errors.js")

describe("admin error handlers", () => {
    beforeEach(() => {
        clearErrorHistory()
        state.guard = { ok: true }
    })

    it("returns the developer access failure for the list", async () => {
        state.guard = { ok: false, status: 401, error: "Unauthorized" }
        const result = await adminErrorsGET(new Headers(), new URLSearchParams())
        assert.equal(result.status, 401)
        assert.equal(result.body.ok === false && result.body.error.error, "Unauthorized")
    })

    it("returns recent errors", async () => {
        captureError("error", "boom", 1)
        const result = await adminErrorsGET(new Headers(), new URLSearchParams())
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.entries[0]?.message, "boom")
    })

    it("returns errors for one guild", async () => {
        captureError("warn", "failed in 100000000000000001", 2)
        const result = await adminErrorsGET(
            new Headers(),
            new URLSearchParams("guildId=100000000000000001")
        )
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.entries.length, 1)
    })

    it("clears the error history", async () => {
        captureError("error", "boom", 1)
        const result = await adminErrorsDELETE(new Headers())
        assert.equal(result.status, 200)
        if (result.body.ok) assert.equal(result.body.data.cleared, true)
        const listed = await adminErrorsGET(new Headers(), new URLSearchParams())
        if (listed.body.ok) assert.equal(listed.body.data.entries.length, 0)
    })
})
