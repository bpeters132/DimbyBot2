import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { redactTokenLikeString, safeJsonSnippet } from "./auth-base-config.js"

describe("redactTokenLikeString", () => {
    it("redacts bearer and OAuth secret patterns in plain and JSON-ish text", () => {
        assert.match(
            redactTokenLikeString("Authorization: Bearer super-secret-token"),
            /Bearer \[redacted\]/
        )
        assert.match(
            redactTokenLikeString("access_token=abc123&refresh_token=def456"),
            /access_token=\[redacted\]/
        )
        assert.match(
            redactTokenLikeString('{"access_token":"tok","refresh_token":"ref"}'),
            /"access_token":"\[redacted\]"/
        )
        assert.match(redactTokenLikeString("client_secret=shhh"), /client_secret=\[redacted\]/)
    })
})

describe("safeJsonSnippet", () => {
    it("redacts strings, lists object keys only, and truncates long output", () => {
        assert.match(safeJsonSnippet("Bearer leaked-token"), /Bearer \[redacted\]/)
        assert.equal(
            safeJsonSnippet({ access_token: "x", guildId: "1" }),
            "{ keys: access_token, guildId }"
        )
        assert.equal(safeJsonSnippet(null), "null")
        assert.equal(safeJsonSnippet(undefined), "undefined")

        const long = "y".repeat(250)
        const snippet = safeJsonSnippet(long, 50)
        assert.equal(snippet.endsWith("…"), true)
        assert.ok(snippet.length <= 51)
    })
})
