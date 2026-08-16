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
        assert.match(
            redactTokenLikeString('{"client_secret":"cs-value"}'),
            /"client_secret":"\[redacted\]"/
        )
        assert.match(
            redactTokenLikeString('{"access_token":"p\\"ass-secret"}'),
            /"access_token":"\[redacted\]"/
        )
        assert.equal(
            redactTokenLikeString('{"access_token":"p\\"ass-secret"}').includes("ass-secret"),
            false
        )
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

    it("redacts secrets inside serialized arrays", () => {
        const snippet = safeJsonSnippet([{ client_secret: "leaked" }, "Bearer tok"])
        assert.match(snippet, /\[redacted\]/)
        assert.equal(snippet.includes("leaked"), false)
        assert.equal(snippet.includes("Bearer tok"), false)
    })
})
