import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { redactBotApiErrorText, sanitizeBotApiError } from "./sanitizeBotApiError.js"

describe("redactBotApiErrorText", () => {
    it("redacts token/secret/password/cookie key=value and Bearer headers", () => {
        const out = redactBotApiErrorText(
            "token=abc123 secret:shh password=p@ss cookie=sid Bearer eyJhbGciOi.payload.sig"
        )
        assert.match(out, /token=\[redacted]/i)
        assert.match(out, /secret=\[redacted]/i)
        assert.match(out, /password=\[redacted]/i)
        assert.match(out, /cookie=\[redacted]/i)
        assert.match(out, /Bearer \[redacted]/)
        assert.doesNotMatch(out, /abc123|shh|p@ss|sid|eyJhbGci/)
    })

    it("redacts credentials embedded in URLs and JWT-shaped tokens", () => {
        const jwt =
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP2S3AkMNUzSOQy6lc45VWXisES5l2kCuba8"
        const out = redactBotApiErrorText(`postgres://user:pass@db.example/app failed ${jwt}`)
        assert.match(out, /postgres:\/\/\[redacted]@/)
        assert.match(out, /\[redacted]/)
        assert.doesNotMatch(out, /user:pass|eyJhbGci/)
    })
})

describe("sanitizeBotApiError", () => {
    it("redacts Error message and first stack line", () => {
        const err = new Error("Authorization Bearer secret-token failed")
        err.name = "UpstreamError"
        err.stack =
            "UpstreamError: Authorization Bearer secret-token failed\n    at handler (x.ts:1:1)"
        const safe = sanitizeBotApiError(err)
        assert.equal(safe.name, "UpstreamError")
        assert.match(safe.message, /Bearer \[redacted]/)
        assert.doesNotMatch(safe.message, /secret-token/)
        assert.ok(safe.safeStack)
        assert.match(safe.safeStack!, /Bearer \[redacted]/)
        assert.doesNotMatch(safe.safeStack!, /secret-token/)
        assert.doesNotMatch(safe.safeStack!, /at handler/)
    })

    it("never returns raw string errors (fail closed)", () => {
        assert.deepEqual(sanitizeBotApiError("token=leaked"), {
            name: "Error",
            message: "[redacted]",
        })
    })

    it("handles unexpected non-error shapes", () => {
        assert.deepEqual(sanitizeBotApiError({ oops: true }), {
            name: "UnknownError",
            message: "Unexpected error shape",
        })
        assert.deepEqual(sanitizeBotApiError(null), {
            name: "UnknownError",
            message: "Unexpected error shape",
        })
    })
})
