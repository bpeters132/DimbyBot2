import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    sanitizeErrorForLog,
    sanitizeParsedForLog,
    stringLooksLikeHostOrDsn,
} from "./status-log-sanitize.js"

describe("stringLooksLikeHostOrDsn", () => {
    it("detects URLs, IPv4, and host:port forms", () => {
        assert.equal(stringLooksLikeHostOrDsn("postgres://user:pass@db.example/app"), true)
        assert.equal(stringLooksLikeHostOrDsn("redis://10.0.0.1:6379"), true)
        assert.equal(stringLooksLikeHostOrDsn("10.0.0.1"), true)
        assert.equal(stringLooksLikeHostOrDsn("db.internal:5432"), true)
        assert.equal(stringLooksLikeHostOrDsn("plain status text"), false)
        assert.equal(stringLooksLikeHostOrDsn("Database unreachable"), false)
    })
})

describe("sanitizeParsedForLog", () => {
    it("redacts sensitive keys and host-like string values", () => {
        const out = sanitizeParsedForLog({
            password: "secret",
            host: "db.example:5432",
            message: "Database unreachable",
            nested: { token: "t", detail: "ok" },
            url: "https://example.com/health",
        }) as Record<string, unknown>

        assert.equal(out.password, "[redacted]")
        assert.equal(out.host, "[redacted]")
        assert.equal(out.message, "Database unreachable")
        assert.equal(out.url, "[redacted]")
        const nested = out.nested as Record<string, unknown>
        assert.equal(nested.token, "[redacted]")
        assert.equal(nested.detail, "ok")
    })

    it("marks circular references and truncates deep trees", () => {
        const circular: Record<string, unknown> = { ok: true }
        circular.self = circular
        const out = sanitizeParsedForLog(circular) as Record<string, unknown>
        assert.equal(out.ok, true)
        assert.equal(out.self, "[circular]")

        let deep: unknown = "leaf"
        for (let i = 0; i < 12; i++) {
            deep = { child: deep }
        }
        const deepOut = sanitizeParsedForLog(deep) as Record<string, unknown>
        let cursor: unknown = deepOut
        for (let i = 0; i < 10; i++) {
            assert.ok(cursor && typeof cursor === "object")
            cursor = (cursor as Record<string, unknown>).child
        }
        assert.equal(cursor, "[too_deep]")
    })
})

describe("sanitizeErrorForLog", () => {
    it("redacts non-Error values", () => {
        assert.deepEqual(sanitizeErrorForLog("boom"), { message: "[redacted]" })
        assert.deepEqual(sanitizeErrorForLog(null), { message: "[redacted]" })
    })

    it("parses JSON error messages and redacts structured secrets", () => {
        const err = new Error(JSON.stringify({ token: "abc", message: "failed" }))
        err.name = "ProbeError"
        const out = sanitizeErrorForLog(err)
        assert.equal(out.name, "ProbeError")
        const parsed = JSON.parse(out.message) as Record<string, unknown>
        assert.equal(parsed.token, "[redacted]")
        assert.equal(parsed.message, "failed")
    })

    it("falls back to sanitizeErrorText for non-JSON messages", () => {
        const err = new Error("password=supersecret probe failed")
        err.name = "Error"
        const out = sanitizeErrorForLog(err)
        assert.equal(out.name, "Error")
        assert.match(out.message, /password=\[REDACTED]/)
        assert.doesNotMatch(out.message, /supersecret/)
    })
})
