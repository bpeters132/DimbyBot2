import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isAdminDbCleanupTarget,
    parseAdminErrorsGuildId,
    parseAdminErrorsLimit,
} from "../../src/botApi/adminRequestParams.js"

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

describe("parseAdminErrorsGuildId", () => {
    it("returns a trimmed snowflake when present", () => {
        assert.equal(parseAdminErrorsGuildId("123456789012345678"), "123456789012345678")
        assert.equal(parseAdminErrorsGuildId("  123456789012345678  "), "123456789012345678")
    })

    it("treats missing, empty, and whitespace-only values as unfiltered recent errors", () => {
        assert.equal(parseAdminErrorsGuildId(null), undefined)
        assert.equal(parseAdminErrorsGuildId(""), undefined)
        assert.equal(parseAdminErrorsGuildId("   "), undefined)
    })
})

describe("parseAdminErrorsLimit", () => {
    it("defaults missing or non-numeric values to 100", () => {
        assert.equal(parseAdminErrorsLimit(null), 100)
        assert.equal(parseAdminErrorsLimit(""), 100)
        assert.equal(parseAdminErrorsLimit("abc"), 100)
        assert.equal(parseAdminErrorsLimit("250junk"), 100)
        assert.equal(parseAdminErrorsLimit("1e3"), 100)
    })

    it("clamps to 1…500 so oversized limits cannot dump the full buffer unboundedly", () => {
        assert.equal(parseAdminErrorsLimit("0"), 1)
        assert.equal(parseAdminErrorsLimit("-5"), 1)
        assert.equal(parseAdminErrorsLimit("250"), 250)
        assert.equal(parseAdminErrorsLimit("9999"), 500)
    })
})
