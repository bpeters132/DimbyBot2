import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapGuildAccessFailureToHttp } from "./guild-access-http.js"

describe("mapGuildAccessFailureToHttp", () => {
    it("maps retryable Discord/OAuth failures to 503 with the upstream detail when present", () => {
        assert.deepEqual(
            mapGuildAccessFailureToHttp({
                retryable: true,
                error: "Missing or expired Discord access token.",
            }),
            {
                ok: false,
                status: 503,
                error: "Service temporarily unavailable",
                details: "Missing or expired Discord access token.",
            }
        )
    })

    it("uses the default 503 copy when retryable failure has no error string", () => {
        const out = mapGuildAccessFailureToHttp({ retryable: true })
        assert.equal(out.status, 503)
        assert.equal(out.error, "Service temporarily unavailable")
        assert.match(out.details, /Try again in a moment/)
    })

    it("maps non-retryable membership failures to 403 and ignores upstream error text", () => {
        const out = mapGuildAccessFailureToHttp({
            retryable: false,
            error: "should not leak into the forbidden body",
        })
        assert.equal(out.status, 403)
        assert.equal(out.error, "Forbidden")
        assert.match(out.details, /Could not verify access to this server/)
        assert.doesNotMatch(out.details, /should not leak/)
    })

    it("treats only boolean true as retryable (truthy lookalikes stay Forbidden)", () => {
        const out = mapGuildAccessFailureToHttp({
            retryable: 1 as unknown as boolean,
        })
        assert.equal(out.status, 403)
        assert.equal(out.error, "Forbidden")
    })
})
