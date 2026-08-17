import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { sanitizeAuditDetails } from "./audit-log.js"

describe("sanitizeAuditDetails", () => {
    it("redacts sensitive keys and omits bulky request envelopes", () => {
        const sanitized = sanitizeAuditDetails({
            token: "secret-token",
            Authorization: "Bearer abc",
            password: "hunter2",
            headers: { cookie: "session=1" },
            body: { raw: true },
            guildId: "123",
        }) as Record<string, unknown>

        assert.equal(sanitized.token, "[redacted]")
        assert.equal(sanitized.Authorization, "[redacted]")
        assert.equal(sanitized.password, "[redacted]")
        assert.equal(sanitized.headers, "[omitted]")
        assert.equal(sanitized.body, "[omitted]")
        assert.equal(sanitized.guildId, "123")
    })

    it("truncates long strings, caps arrays, and truncates depth", () => {
        const long = "x".repeat(700)
        assert.equal((sanitizeAuditDetails(long) as string).endsWith("…"), true)
        assert.equal((sanitizeAuditDetails(long) as string).length, 601)

        const arr = sanitizeAuditDetails(Array.from({ length: 25 }, (_, i) => i)) as unknown[]
        assert.equal(arr.length, 20)

        const deep = { a: { b: { c: { d: { e: { f: "too-deep" } } } } } }
        const sanitized = sanitizeAuditDetails(deep) as {
            a: { b: { c: { d: { e: unknown } } } }
        }
        assert.equal(sanitized.a.b.c.d.e, "[truncated-depth]")
    })

    it("serializes Error values without leaking nested secrets in message only", () => {
        const err = new Error("boom")
        err.name = "TestError"
        const sanitized = sanitizeAuditDetails(err) as {
            name: string
            message: string
            stack?: string
        }
        assert.equal(sanitized.name, "TestError")
        assert.equal(sanitized.message, "boom")
        assert.equal(typeof sanitized.stack === "string" || sanitized.stack === undefined, true)
    })

    it("redacts secrets in Error message and stack before logging", () => {
        const err = new Error('Bearer leaked-token access_token=abc123 {"access_token":"tok"}')
        err.name = "SecretError"
        err.stack = `SecretError: Bearer leaked-token\n    at handler (x.ts:1:1)`
        const sanitized = sanitizeAuditDetails(err) as {
            name: string
            message: string
            stack?: string
        }
        assert.equal(sanitized.name, "SecretError")
        assert.match(sanitized.message, /Bearer \[redacted\]/)
        assert.match(sanitized.message, /access_token=\[redacted\]/)
        assert.match(sanitized.message, /"access_token":"\[redacted]"/)
        assert.doesNotMatch(sanitized.message, /leaked-token|abc123|"tok"/)
        assert.ok(sanitized.stack)
        assert.match(sanitized.stack!, /Bearer \[redacted\]/)
        assert.doesNotMatch(sanitized.stack!, /leaked-token/)
    })

    it("redacts direct string details before truncating", () => {
        const sanitized = sanitizeAuditDetails(
            "Authorization: Bearer leaked-token access_token=abc123"
        ) as string
        assert.match(sanitized, /Bearer \[redacted\]/)
        assert.match(sanitized, /access_token=\[redacted\]/)
        assert.doesNotMatch(sanitized, /leaked-token|abc123/)
    })
})
