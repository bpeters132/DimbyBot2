import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { BotClientNotInitializedError } from "../lib/botClientRegistry.js"
import { classifyBotApiErrorResponse } from "./classifyBotApiErrorResponse.js"

function jsonParseError(message: string): SyntaxError {
    const err = new SyntaxError(message)
    ;(err as SyntaxError & { status: number; type: string }).status = 400
    ;(err as SyntaxError & { status: number; type: string }).type = "entity.parse.failed"
    return err
}

describe("classifyBotApiErrorResponse", () => {
    it("maps Express JSON parse failures to 400 Malformed JSON", () => {
        const classified = classifyBotApiErrorResponse(
            jsonParseError("Unexpected token } in JSON at position 1")
        )
        assert.equal(classified.status, 400)
        assert.equal(classified.body.ok, false)
        assert.equal(classified.body.error.error, "Malformed JSON")
        assert.match(classified.body.error.details ?? "", /Unexpected token/)
    })

    it("maps an uninitialized bot client to 503 without treating it as a generic 500", () => {
        const classified = classifyBotApiErrorResponse(new BotClientNotInitializedError())
        assert.deepEqual(classified, {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Bot is not ready",
                    details: "Bot client is not initialized yet.",
                },
            },
        })
    })

    it("prefers err.status over statusCode and floors numeric 4xx", () => {
        const fromStatus = classifyBotApiErrorResponse(
            Object.assign(new Error("unauthorized"), { status: 401.9, statusCode: 429 })
        )
        assert.equal(fromStatus.status, 401)
        assert.equal(fromStatus.body.error.error, "Request error")
        assert.equal(fromStatus.body.error.details, "unauthorized")

        const fromStatusCode = classifyBotApiErrorResponse(
            Object.assign(new Error("slow down"), { statusCode: 429 })
        )
        assert.equal(fromStatusCode.status, 429)
        assert.equal(fromStatusCode.body.error.details, "slow down")
    })

    it("uses Bad request when a 4xx error has an empty message", () => {
        const classified = classifyBotApiErrorResponse(
            Object.assign(new Error(""), { status: 400 })
        )
        assert.equal(classified.status, 400)
        assert.equal(classified.body.error.details, "Bad request")
    })

    it("does not pass 5xx status through; handler bugs stay Internal server error", () => {
        const classified = classifyBotApiErrorResponse({
            status: 503,
            message: "secret token=abc",
        })
        assert.deepEqual(classified, {
            status: 500,
            body: { ok: false, error: { error: "Internal server error" } },
        })
    })

    it("does not leak raw exception text on unclassified errors", () => {
        const classified = classifyBotApiErrorResponse(new Error("DATABASE_URL=postgres://x:y@z"))
        assert.deepEqual(classified, {
            status: 500,
            body: { ok: false, error: { error: "Internal server error" } },
        })
        assert.equal(classified.body.error.details, undefined)
    })

    it("treats a SyntaxError without entity.parse.failed as a numeric 4xx when status is 400", () => {
        const err = new SyntaxError("not express json")
        ;(err as SyntaxError & { status: number }).status = 400
        const classified = classifyBotApiErrorResponse(err)
        assert.equal(classified.status, 400)
        assert.equal(classified.body.error.error, "Request error")
    })
})
