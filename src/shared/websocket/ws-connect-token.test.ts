import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { describe, it } from "node:test"
import { createWsConnectToken, parseWsConnectToken } from "./ws-connect-token.js"

describe("ws-connect-token", () => {
    const secret = "test-ws-secret-key"

    it("round-trips a valid token", () => {
        const token = createWsConnectToken("123456789012345678", secret, 60)
        assert.equal(parseWsConnectToken(token, secret), "123456789012345678")
    })

    it("rejects tampered signatures, wrong secrets, and malformed tokens", () => {
        const token = createWsConnectToken("user-1", secret, 60)
        const sep = token.lastIndexOf(".")
        const sig = token.slice(sep + 1)
        // Flip the first sig char — last-char edits can be no-ops under base64url decode.
        const tamperedSig = (sig[0] === "a" ? "b" : "a") + sig.slice(1)
        assert.equal(parseWsConnectToken(token, "other-secret"), null)
        assert.equal(parseWsConnectToken(`${token.slice(0, sep + 1)}${tamperedSig}`, secret), null)
        assert.equal(parseWsConnectToken("not-a-token", secret), null)
        assert.equal(parseWsConnectToken("", secret), null)
    })

    it("rejects expired tokens", () => {
        const token = createWsConnectToken("user-1", secret, 60)
        const i = token.lastIndexOf(".")
        const payload = JSON.parse(Buffer.from(token.slice(0, i), "base64url").toString("utf8"))
        payload.exp = Math.floor(Date.now() / 1000) - 1
        const expiredPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
        const sig = createHmac("sha256", Buffer.from(secret, "utf8"))
            .update(expiredPayload)
            .digest("base64url")
        assert.equal(parseWsConnectToken(`${expiredPayload}.${sig}`, secret), null)
    })

    it("rejects non-positive ttl on create", () => {
        assert.throws(() => createWsConnectToken("u", secret, 0))
        assert.throws(() => createWsConnectToken("u", secret, -1))
        assert.throws(() => createWsConnectToken("u", secret, 1.5))
        assert.throws(() => createWsConnectToken("u", "", 60))
    })
})
