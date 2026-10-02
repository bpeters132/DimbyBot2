import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    isBotApiProxyFetchAbort,
    resolveBotApiProxyFetchFailure,
} from "@/lib/bot-api-proxy-fetch-failure.js"

function abortError(message = "The operation was aborted"): Error {
    const err = new Error(message)
    err.name = "AbortError"
    return err
}

describe("isBotApiProxyFetchAbort", () => {
    it("treats only AbortError name as a timeout, not abort-like messages", () => {
        assert.equal(isBotApiProxyFetchAbort(abortError()), true)
        assert.equal(isBotApiProxyFetchAbort(new Error("This operation was aborted")), false)
        assert.equal(isBotApiProxyFetchAbort(new Error("request abort")), false)
    })

    it("does not treat generic transport errors as aborts", () => {
        assert.equal(isBotApiProxyFetchAbort(new Error("fetch failed")), false)
        assert.equal(isBotApiProxyFetchAbort(new Error("ECONNREFUSED")), false)
        assert.equal(isBotApiProxyFetchAbort("fail"), false)
    })

    it("treats DOMException AbortError as a timeout when the runtime provides it", () => {
        if (typeof DOMException === "undefined") return
        assert.equal(isBotApiProxyFetchAbort(new DOMException("Aborted", "AbortError")), true)
        assert.equal(
            isBotApiProxyFetchAbort(new DOMException("Network error", "NetworkError")),
            false
        )
    })
})

describe("resolveBotApiProxyFetchFailure", () => {
    it("maps named AbortError to HTTP 504 with proxy timeout copy", () => {
        assert.deepEqual(resolveBotApiProxyFetchFailure(abortError()), {
            kind: "timeout",
            status: 504,
            body: {
                ok: false,
                error: "Bot API timeout",
                details: "Upstream bot API request timed out.",
            },
        })
    })

    it("maps other fetch throws to HTTP 502 unreachable with proxy copy", () => {
        assert.deepEqual(resolveBotApiProxyFetchFailure(new Error("connect ECONNREFUSED")), {
            kind: "unreachable",
            status: 502,
            body: {
                ok: false,
                error: "Bot API unreachable",
                details: "Upstream bot API request failed.",
            },
        })
    })

    it("does not treat abort-like messages without AbortError name as timeouts", () => {
        assert.deepEqual(resolveBotApiProxyFetchFailure(new Error("This operation was aborted")), {
            kind: "unreachable",
            status: 502,
            body: {
                ok: false,
                error: "Bot API unreachable",
                details: "Upstream bot API request failed.",
            },
        })
    })
})
