import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { authErrorMessage } from "../web/lib/auth-error-message.js"
import { normalizeSearchParam } from "../web/lib/normalize-search-param.js"
import { sanitizeErrorText } from "../web/lib/sanitize-log-text.js"

describe("sanitizeErrorText", () => {
    it("redacts bearer/basic auth, password, and token key=value forms", () => {
        const out = sanitizeErrorText(
            "Authorization Bearer abc.def-ghi Authorization Basic dXNlcjpwYXNz password=supersecret token=xyz apikey=abc123 secret=shh",
            2000
        )
        assert.match(out, /Bearer \[REDACTED]/)
        assert.match(out, /Basic \[REDACTED]/)
        assert.match(out, /password=\[REDACTED]/)
        assert.match(out, /token=\[REDACTED]/)
        assert.match(out, /secret=\[REDACTED]/)
        assert.doesNotMatch(out, /supersecret|xyz|abc123|shh|abc\.def/)
    })

    it("redacts JSON secret keys, DB URLs, and JWTs", () => {
        const jwt =
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP2S3AkMNUzSOQy6lc45VWXisES5l2kCuba8"
        const out = sanitizeErrorText(
            `{"access_token":"tok","client_secret":"cs","api_key":"k"} postgres://user:pass@host/db ${jwt}`,
            4000
        )
        assert.match(out, /"access_token":"\[REDACTED]"/)
        assert.match(out, /"client_secret":"\[REDACTED]"/)
        assert.match(out, /"api_key":"\[REDACTED]"/)
        assert.match(out, /postgres:\/\/\[REDACTED]@/)
        assert.match(out, /\[REDACTED_JWT]/)
        assert.doesNotMatch(out, /user:pass|tok"|"cs"|"k"|eyJhbGci/)
    })

    it("truncates output to maxLen with an ellipsis", () => {
        const out = sanitizeErrorText("abcdefghij", 5)
        assert.equal(out, "abcde…")
    })
})

describe("normalizeSearchParam", () => {
    it("returns undefined for missing values", () => {
        assert.equal(normalizeSearchParam(undefined), undefined)
    })

    it("returns the first non-empty trimmed entry from repeated keys", () => {
        assert.equal(normalizeSearchParam(["", "  ", " first ", "second"]), "first")
        assert.equal(normalizeSearchParam(["only"]), "only")
    })

    it("falls back to the first string when all entries are empty", () => {
        assert.equal(normalizeSearchParam(["", "  "]), "")
        assert.equal(normalizeSearchParam([]), undefined)
    })

    it("passes through a single string unchanged", () => {
        assert.equal(normalizeSearchParam("access_denied"), "access_denied")
    })
})

describe("authErrorMessage", () => {
    it("maps known OAuth codes to specific copy", () => {
        assert.match(authErrorMessage("please_restart_the_process"), /expired or was interrupted/i)
        assert.match(authErrorMessage("ACCESS_DENIED"), /cancelled/i)
        assert.match(authErrorMessage(" invalid_code "), /already been used/i)
        assert.match(authErrorMessage("invalid_grant"), /already been used/i)
    })

    it("uses a generic message for missing or unknown codes", () => {
        assert.match(authErrorMessage(undefined), /could not be completed/i)
        assert.match(authErrorMessage(""), /could not be completed/i)
        assert.match(authErrorMessage("totally_unknown"), /Try again from the home page/i)
    })
})
