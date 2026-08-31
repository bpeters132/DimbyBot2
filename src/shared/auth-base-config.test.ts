import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    parseDiscordOAuthRefreshPayload,
    redactTokenLikeString,
    safeJsonSnippet,
} from "./auth-base-config.js"

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

describe("parseDiscordOAuthRefreshPayload", () => {
    const previous = "prev-refresh-token"
    const nowMs = Date.UTC(2026, 0, 1, 12, 0, 0)

    it("maps a valid payload and computes expiry from nowMs", () => {
        const out = parseDiscordOAuthRefreshPayload(
            {
                access_token: "access-1",
                expires_in: 3600,
                refresh_token: "next-refresh",
            },
            previous,
            nowMs
        )
        assert.equal(out.ok, true)
        assert.ok(out.ok)
        assert.equal(out.tokens.accessToken, "access-1")
        assert.equal(out.tokens.refreshToken, "next-refresh")
        assert.equal(out.tokens.accessTokenExpiresAt.getTime(), nowMs + 3600 * 1000)
    })

    it("preserves previous refresh when Discord omits or blanks refresh_token", () => {
        const omitted = parseDiscordOAuthRefreshPayload(
            { access_token: "a", expires_in: 60 },
            previous,
            nowMs
        )
        assert.ok(omitted.ok)
        assert.equal(omitted.tokens.refreshToken, previous)

        const blank = parseDiscordOAuthRefreshPayload(
            { access_token: "a", expires_in: 60, refresh_token: "   " },
            previous,
            nowMs
        )
        assert.ok(blank.ok)
        assert.equal(blank.tokens.refreshToken, previous)

        const empty = parseDiscordOAuthRefreshPayload(
            { access_token: "a", expires_in: 60, refresh_token: "" },
            previous,
            nowMs
        )
        assert.ok(empty.ok)
        assert.equal(empty.tokens.refreshToken, previous)
    })

    it("trims access and refresh tokens", () => {
        const out = parseDiscordOAuthRefreshPayload(
            {
                access_token: "  access-trim  ",
                expires_in: 10,
                refresh_token: "  refresh-trim  ",
            },
            previous,
            nowMs
        )
        assert.ok(out.ok)
        assert.equal(out.tokens.accessToken, "access-trim")
        assert.equal(out.tokens.refreshToken, "refresh-trim")
    })

    it("rejects non-object payloads", () => {
        for (const parsed of [null, undefined, "x", 1, true, []]) {
            const out = parseDiscordOAuthRefreshPayload(parsed, previous, nowMs)
            assert.equal(out.ok, false)
            assert.ok(out.ok === false)
            assert.equal(out.reason, "non_object")
        }
    })

    it("rejects missing, non-string, empty, or whitespace access_token", () => {
        for (const access_token of [undefined, null, 1, "", "   "]) {
            const out = parseDiscordOAuthRefreshPayload(
                { access_token, expires_in: 60 },
                previous,
                nowMs
            )
            assert.ok(out.ok === false)
            assert.equal(out.reason, "missing_access_token")
        }
    })

    it("rejects missing, non-finite, zero, or negative expires_in", () => {
        for (const expires_in of [undefined, "60", NaN, Infinity, 0, -1]) {
            const out = parseDiscordOAuthRefreshPayload(
                { access_token: "a", expires_in },
                previous,
                nowMs
            )
            assert.ok(out.ok === false)
            assert.equal(out.reason, "missing_expires_in")
        }
    })

    it("rejects expires_in values that overflow into a non-finite Date", () => {
        const out = parseDiscordOAuthRefreshPayload(
            { access_token: "a", expires_in: Number.MAX_VALUE },
            previous,
            nowMs
        )
        assert.ok(out.ok === false)
        assert.equal(out.reason, "invalid_expires_at")
    })
})
