import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { classifyAuthSessionFailure } from "@/lib/auth-session-failure"

describe("classifyAuthSessionFailure", () => {
    it("classifies database connectivity failures", () => {
        assert.equal(
            classifyAuthSessionFailure("P1001: Can't reach database server"),
            "database_connectivity"
        )
        assert.equal(
            classifyAuthSessionFailure("connect ECONNREFUSED 127.0.0.1:5432"),
            "database_connectivity"
        )
        assert.equal(classifyAuthSessionFailure("read ETIMEDOUT"), "database_connectivity")
        assert.equal(
            classifyAuthSessionFailure("getaddrinfo ENOTFOUND db.internal"),
            "database_connectivity"
        )
        assert.equal(
            classifyAuthSessionFailure("Connection refused by peer"),
            "database_connectivity"
        )
        assert.equal(
            classifyAuthSessionFailure("Cannot reach database at host"),
            "database_connectivity"
        )
    })

    it("classifies database schema failures", () => {
        assert.equal(
            classifyAuthSessionFailure('relation "session" does not exist'),
            "database_schema"
        )
        assert.equal(
            classifyAuthSessionFailure("P2021: The table does not exist"),
            "database_schema"
        )
        assert.equal(classifyAuthSessionFailure("no such table: user"), "database_schema")
        assert.equal(classifyAuthSessionFailure("Unknown table 'account'"), "database_schema")
    })

    it("classifies auth configuration / token failures", () => {
        assert.equal(classifyAuthSessionFailure("JWE decryption failed"), "auth_configuration")
        assert.equal(classifyAuthSessionFailure("JWT is invalid"), "auth_configuration")
        assert.equal(classifyAuthSessionFailure("Invalid signing key"), "auth_configuration")
        assert.equal(classifyAuthSessionFailure("session token missing"), "auth_configuration")
    })

    it("returns unknown for unrelated errors", () => {
        assert.equal(classifyAuthSessionFailure("Unexpected server error"), "unknown")
        assert.equal(classifyAuthSessionFailure(""), "unknown")
        // "jwt" alone is not enough without "invalid"
        assert.equal(classifyAuthSessionFailure("jwt header parsed"), "unknown")
    })
})
