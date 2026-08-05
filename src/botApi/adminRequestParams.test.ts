import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isAdminDbCleanupTarget, parseAdminErrorsLimit } from "./adminRequestParams.js"

describe("isAdminDbCleanupTarget", () => {
    it("accepts only sessions, verifications, and all", () => {
        assert.equal(isAdminDbCleanupTarget("sessions"), true)
        assert.equal(isAdminDbCleanupTarget("verifications"), true)
        assert.equal(isAdminDbCleanupTarget("all"), true)
    })

    it("rejects lookalikes and wrong types that could widen deletes", () => {
        assert.equal(isAdminDbCleanupTarget("session"), false)
        assert.equal(isAdminDbCleanupTarget("ALL"), false)
        assert.equal(isAdminDbCleanupTarget(""), false)
        assert.equal(isAdminDbCleanupTarget(null), false)
        assert.equal(isAdminDbCleanupTarget(undefined), false)
        assert.equal(isAdminDbCleanupTarget(["all"]), false)
    })
})

describe("parseAdminErrorsLimit", () => {
    it("defaults missing or non-numeric values to 100", () => {
        assert.equal(parseAdminErrorsLimit(null), 100)
        assert.equal(parseAdminErrorsLimit(""), 100)
        assert.equal(parseAdminErrorsLimit("abc"), 100)
    })

    it("clamps to 1…500 so oversized limits cannot dump the full buffer unboundedly", () => {
        assert.equal(parseAdminErrorsLimit("0"), 1)
        assert.equal(parseAdminErrorsLimit("-5"), 1)
        assert.equal(parseAdminErrorsLimit("250"), 250)
        assert.equal(parseAdminErrorsLimit("9999"), 500)
    })
})
