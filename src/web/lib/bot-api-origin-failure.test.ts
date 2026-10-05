import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapServerFetchBotOriginFailure } from "@/lib/bot-api-origin-failure.js"

describe("mapServerFetchBotOriginFailure", () => {
    it("maps an invalid API_PROXY_TARGET to nested 503 misconfigured copy", () => {
        assert.deepEqual(mapServerFetchBotOriginFailure("invalid"), {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Bot API misconfigured",
                    details: "Bot API misconfigured",
                },
            },
        })
    })

    it("maps a missing origin to nested 503 not-configured copy", () => {
        const unset = mapServerFetchBotOriginFailure("unset")
        assert.deepEqual(unset, {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Bot API not configured",
                    details:
                        "Set API_PROXY_TARGET to the bot HTTP origin (e.g. http://localhost:3001).",
                },
            },
        })
        assert.notEqual(unset.body.error.error, "Bot API misconfigured")
        assert.match(unset.body.error.details, /API_PROXY_TARGET/)
    })

    it("keeps both origin failures at 503 and does not use the fetch 502/504 envelope", () => {
        const invalid = mapServerFetchBotOriginFailure("invalid")
        const unset = mapServerFetchBotOriginFailure("unset")
        assert.equal(invalid.status, 503)
        assert.equal(unset.status, 503)
        assert.equal(invalid.body.ok, false)
        assert.equal(typeof invalid.body.error, "object")
        assert.notEqual(invalid.body.error.error, unset.body.error.error)
    })
})
