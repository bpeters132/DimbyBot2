import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isMemberFetchNotFound } from "./discordMemberFetchError.js"

describe("isMemberFetchNotFound", () => {
    it("returns false for non-objects and unrelated errors", () => {
        assert.equal(isMemberFetchNotFound(null), false)
        assert.equal(isMemberFetchNotFound(undefined), false)
        assert.equal(isMemberFetchNotFound("UnknownMember"), false)
        assert.equal(isMemberFetchNotFound({ status: 500 }), false)
        assert.equal(isMemberFetchNotFound({ code: 50035, name: "DiscordAPIError" }), false)
    })

    it("detects Discord unknown-member and 404 shapes", () => {
        assert.equal(isMemberFetchNotFound({ status: 404 }), true)
        assert.equal(isMemberFetchNotFound({ code: 404 }), true)
        assert.equal(isMemberFetchNotFound({ code: 10007 }), true)
        assert.equal(isMemberFetchNotFound({ name: "UnknownMember" }), true)
        assert.equal(
            isMemberFetchNotFound({ status: 404, code: 10007, name: "UnknownMember" }),
            true
        )
    })
})
