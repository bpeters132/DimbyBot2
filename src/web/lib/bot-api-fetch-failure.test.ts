import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isBotApiFetchAbort, resolveBotApiFetchFailure } from "@/lib/bot-api-fetch-failure.js"

function abortError(message = "The operation was aborted"): Error {
    const err = new Error(message)
    err.name = "AbortError"
    return err
}

describe("isBotApiFetchAbort", () => {
    it("treats AbortError name and abort-like messages as timeouts", () => {
        assert.equal(isBotApiFetchAbort(abortError()), true)
        assert.equal(isBotApiFetchAbort(new Error("This operation was aborted")), true)
        assert.equal(isBotApiFetchAbort(new Error("request abort")), true)
    })

    it("does not treat generic transport errors as aborts", () => {
        assert.equal(isBotApiFetchAbort(new Error("fetch failed")), false)
        assert.equal(isBotApiFetchAbort(new Error("ECONNREFUSED")), false)
        assert.equal(isBotApiFetchAbort("fail"), false)
    })

    it("treats DOMException AbortError as a timeout when the runtime provides it", () => {
        if (typeof DOMException === "undefined") return
        assert.equal(isBotApiFetchAbort(new DOMException("Aborted", "AbortError")), true)
        assert.equal(isBotApiFetchAbort(new DOMException("Network error", "NetworkError")), false)
    })
})

describe("resolveBotApiFetchFailure", () => {
    it("maps abort/timeout to HTTP 504 with timeout copy", () => {
        assert.deepEqual(resolveBotApiFetchFailure(abortError()), {
            kind: "timeout",
            status: 504,
            error: "Bot API request timed out",
            details: "Upstream bot did not respond before the timeout.",
        })
    })

    it("maps other fetch throws to HTTP 502 unreachable", () => {
        assert.deepEqual(resolveBotApiFetchFailure(new Error("connect ECONNREFUSED")), {
            kind: "unreachable",
            status: 502,
            error: "Bot API unreachable",
            details: "Unable to reach Bot API",
        })
    })
})
