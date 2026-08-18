import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    normalizeSecretKey,
    redactSecrets,
    shouldRedactKey,
} from "../shared/bot-api-verbose-redact.js"

describe("normalizeSecretKey", () => {
    it("lowercases and strips non-alphanumerics", () => {
        assert.equal(normalizeSecretKey("X-API-Key"), "xapikey")
        assert.equal(normalizeSecretKey("access_token"), "accesstoken")
        assert.equal(normalizeSecretKey("Client-Secret"), "clientsecret")
    })
})

describe("shouldRedactKey", () => {
    it("redacts exact and fuzzy secret key names", () => {
        assert.equal(shouldRedactKey("token"), true)
        assert.equal(shouldRedactKey("Authorization"), true)
        assert.equal(shouldRedactKey("x-api-key"), true)
        assert.equal(shouldRedactKey("client_secret"), true)
        assert.equal(shouldRedactKey("set-cookie"), true)
        assert.equal(shouldRedactKey("accessToken"), true)
        assert.equal(shouldRedactKey("my_api_token"), true)
        assert.equal(shouldRedactKey("config_secret"), true)
        assert.equal(shouldRedactKey("dbConfig"), true)
    })

    it("allows non-secret operational keys", () => {
        assert.equal(shouldRedactKey("guildId"), false)
        assert.equal(shouldRedactKey("status"), false)
        assert.equal(shouldRedactKey("ms"), false)
        assert.equal(shouldRedactKey("pathname"), false)
        assert.equal(shouldRedactKey("healthTarget"), false)
    })
})

describe("redactSecrets", () => {
    it("redacts secret keys and sanitizes embedded bearer tokens in strings", () => {
        const out = redactSecrets({
            guildId: "123",
            authorization: "Bearer super-secret-token",
            note: "Authorization Bearer abc.def-ghi left in message",
            nested: { client_secret: "shh", ok: true },
        }) as Record<string, unknown>

        assert.equal(out.guildId, "123")
        assert.equal(out.authorization, "[REDACTED]")
        assert.match(String(out.note), /Bearer \[REDACTED]/)
        assert.doesNotMatch(String(out.note), /abc\.def/)
        const nested = out.nested as Record<string, unknown>
        assert.equal(nested.client_secret, "[REDACTED]")
        assert.equal(nested.ok, true)
    })

    it("handles arrays and circular references without throwing", () => {
        const circular: Record<string, unknown> = { a: 1 }
        circular.self = circular
        const out = redactSecrets({
            items: [{ token: "t" }, "password=secret"],
            circular,
        }) as Record<string, unknown>

        const items = out.items as unknown[]
        assert.deepEqual(items[0], { token: "[REDACTED]" })
        assert.match(String(items[1]), /password=\[REDACTED]/)
        const circ = out.circular as Record<string, unknown>
        assert.equal(circ.a, 1)
        assert.equal(circ.self, "[Circular]")
    })

    it("passes through null, undefined, and non-object primitives", () => {
        assert.equal(redactSecrets(null), null)
        assert.equal(redactSecrets(undefined), undefined)
        assert.equal(redactSecrets(42), 42)
        assert.equal(redactSecrets(true), true)
    })
})
