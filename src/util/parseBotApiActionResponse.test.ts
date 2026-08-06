import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseBotApiActionResponse } from "../web/lib/parse-bot-api-response.js"

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    })
}

describe("parseBotApiActionResponse", () => {
    it("returns data for a successful payload", async () => {
        const out = await parseBotApiActionResponse<{ id: number }>(
            jsonResponse(200, { ok: true, data: { id: 7 } })
        )
        assert.deepEqual(out, { ok: true, data: { id: 7 } })
    })

    it("fails closed on empty body and invalid JSON", async () => {
        const emptyOk = await parseBotApiActionResponse(new Response("   ", { status: 200 }))
        assert.deepEqual(emptyOk, { ok: false, error: "Empty response from bot API." })

        const emptyErr = await parseBotApiActionResponse(new Response("", { status: 502 }))
        assert.deepEqual(emptyErr, {
            ok: false,
            error: "Request failed (502): empty body.",
        })

        const badJson = await parseBotApiActionResponse(
            new Response("{not-json", { status: 200, headers: { "content-type": "application/json" } })
        )
        assert.deepEqual(badJson, { ok: false, error: "Invalid JSON from bot API." })
    })

    it("surfaces HTTP error details when present", async () => {
        const withDetails = await parseBotApiActionResponse(
            jsonResponse(403, {
                ok: false,
                error: { error: "Forbidden", details: "Missing MANAGE_QUEUE" },
            })
        )
        assert.deepEqual(withDetails, {
            ok: false,
            error: "Missing MANAGE_QUEUE — Forbidden",
        })

        const bare = await parseBotApiActionResponse(jsonResponse(500, { ok: true, data: null }))
        assert.deepEqual(bare, { ok: false, error: "Request failed (500)." })
    })

    it("handles logical failures and missing data on HTTP 200", async () => {
        const logical = await parseBotApiActionResponse(
            jsonResponse(200, {
                ok: false,
                error: { error: "Not found", details: "Playlist missing" },
            })
        )
        assert.deepEqual(logical, {
            ok: false,
            error: "Playlist missing — Not found",
        })

        const stringErr = await parseBotApiActionResponse(
            jsonResponse(200, { ok: false, error: "  boom  " })
        )
        assert.deepEqual(stringErr, { ok: false, error: "boom" })

        const noData = await parseBotApiActionResponse(jsonResponse(200, { ok: true }))
        assert.deepEqual(noData, {
            ok: false,
            error: "Bot API returned success without data.",
        })
    })
})
