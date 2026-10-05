import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapProxyBotApiOriginFailure } from "@/lib/bot-api-proxy-origin-failure.js"

describe("mapProxyBotApiOriginFailure", () => {
    it("maps an invalid API_PROXY_TARGET to flat 503 misconfigured copy", () => {
        assert.deepEqual(mapProxyBotApiOriginFailure("invalid"), {
            status: 503,
            body: {
                ok: false,
                error: "Bot API misconfigured",
                details: "Bot API misconfigured",
            },
        })
    })

    it("maps a missing origin to flat 503 not-configured copy", () => {
        const unset = mapProxyBotApiOriginFailure("unset")
        assert.deepEqual(unset, {
            status: 503,
            body: {
                ok: false,
                error: "Bot API not configured",
                details:
                    "Set API_PROXY_TARGET to the bot HTTP origin (e.g. http://localhost:3001).",
            },
        })
        assert.notEqual(unset.body.error, "Bot API misconfigured")
        assert.match(unset.body.details, /API_PROXY_TARGET/)
    })

    it("keeps the proxy origin envelope flat, not the nested serverFetchBot shape", () => {
        const invalid = mapProxyBotApiOriginFailure("invalid")
        const unset = mapProxyBotApiOriginFailure("unset")
        assert.equal(invalid.status, 503)
        assert.equal(unset.status, 503)
        assert.equal(typeof invalid.body.error, "string")
        assert.equal(typeof unset.body.error, "string")
        assert.equal(typeof invalid.body.details, "string")
        assert.notEqual(invalid.body.error, unset.body.error)
        assert.notEqual(invalid.status, 502)
        assert.notEqual(invalid.status, 504)
    })
})
