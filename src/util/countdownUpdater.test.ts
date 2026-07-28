import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isUnrecoverableCountdownDiscordError } from "./countdownUpdater.js"

describe("isUnrecoverableCountdownDiscordError", () => {
    it("deletes countdowns only for unknown channel/message", () => {
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 10003 }), true)
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 10008 }), true)
    })

    it("retries permission and non-numeric failures instead of wiping countdown rows", () => {
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 50001 }), false)
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 50013 }), false)
        assert.equal(isUnrecoverableCountdownDiscordError({ code: "10003" }), false)
        assert.equal(isUnrecoverableCountdownDiscordError(new Error("timeout")), false)
        assert.equal(isUnrecoverableCountdownDiscordError(null), false)
    })
})
