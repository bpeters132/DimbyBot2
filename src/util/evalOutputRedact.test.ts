import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    collectEvalRedactionMap,
    isSensitiveEvalEnvKey,
    redactEvalOutput,
} from "./evalOutputRedact.js"

describe("isSensitiveEvalEnvKey", () => {
    it("matches credential-style env names used by Discord, Better Auth, and APIs", () => {
        for (const key of [
            "DISCORD_TOKEN",
            "BOT_TOKEN",
            "TOKEN",
            "BETTER_AUTH_SECRET",
            "DISCORD_CLIENT_SECRET",
            "API_KEY",
            "YOUTUBE_DATA_API_KEY",
            "DATABASE_PASSWORD",
            "POSTGRES_PASSWORD",
            "PRIVATE_KEY",
            "ACCESS_TOKEN",
            "CLIENT_CREDENTIAL",
        ]) {
            assert.equal(isSensitiveEvalEnvKey(key), true, key)
        }
    })

    it("does not treat ordinary config as secrets", () => {
        for (const key of [
            "NODE_ENV",
            "OWNER_ID",
            "GUILD_ID",
            "PORT",
            "BETTER_AUTH_URL",
            "DATABASE_URL",
            "CLIENT_ID",
            "PATH",
            "HOME",
        ]) {
            assert.equal(isSensitiveEvalEnvKey(key), false, key)
        }
    })
})

describe("collectEvalRedactionMap", () => {
    it("records the bot token first and skips blank tokens", () => {
        const withToken = collectEvalRedactionMap("bot-token-value", {})
        assert.equal(withToken.get("bot-token-value"), "[REDACTED TOKEN]")
        assert.equal(collectEvalRedactionMap("", {}).size, 0)
        assert.equal(collectEvalRedactionMap(null, {}).size, 0)
        assert.equal(collectEvalRedactionMap(undefined, {}).size, 0)
    })

    it("maps sensitive env values and ignores empty or non-credential keys", () => {
        const map = collectEvalRedactionMap(undefined, {
            NODE_ENV: "production",
            OWNER_ID: "123",
            BETTER_AUTH_SECRET: "auth-secret",
            API_KEY: "",
            DISCORD_TOKEN: "env-token",
        })
        assert.equal(map.get("auth-secret"), "[REDACTED ENV: BETTER_AUTH_SECRET]")
        assert.equal(map.get("env-token"), "[REDACTED ENV: DISCORD_TOKEN]")
        assert.equal(map.has("production"), false)
        assert.equal(map.has("123"), false)
        assert.equal(map.has(""), false)
    })

    it("keeps the token placeholder when an env var duplicates the bot token", () => {
        const map = collectEvalRedactionMap("same-secret", {
            DISCORD_TOKEN: "same-secret",
        })
        assert.equal(map.get("same-secret"), "[REDACTED TOKEN]")
        assert.equal(map.size, 1)
    })

    it("keeps the first env key when two credential vars share a value", () => {
        const map = collectEvalRedactionMap(undefined, {
            API_KEY: "shared",
            BOT_TOKEN: "shared",
        })
        assert.equal(map.get("shared"), "[REDACTED ENV: API_KEY]")
    })
})

describe("redactEvalOutput", () => {
    it("replaces every occurrence, longest secret first", () => {
        const sensitive = new Map<string, string>([
            ["abc", "[SHORT]"],
            ["abcdef", "[LONG]"],
        ])
        assert.equal(
            redactEvalOutput("abcdef and abc and abcdef", sensitive),
            "[LONG] and [SHORT] and [LONG]"
        )
    })

    it("returns the original string when there is nothing to redact", () => {
        assert.equal(redactEvalOutput("harmless", new Map()), "harmless")
        assert.equal(redactEvalOutput("", collectEvalRedactionMap("tok", {})), "")
    })
})
