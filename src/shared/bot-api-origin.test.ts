import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getBotApiOrigin } from "./bot-api-origin.js"

function withEnv(
    overrides: Record<string, string | undefined>,
    fn: () => void
): void {
    const previous = new Map<string, string | undefined>()
    for (const key of Object.keys(overrides)) {
        previous.set(key, process.env[key])
        const next = overrides[key]
        if (next === undefined) delete process.env[key]
        else process.env[key] = next
    }
    try {
        fn()
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    }
}

describe("getBotApiOrigin", () => {
    it("returns null when API_PROXY_TARGET is unset outside development", () => {
        withEnv({ API_PROXY_TARGET: undefined, NODE_ENV: "production" }, () => {
            assert.equal(getBotApiOrigin(), null)
        })
    })

    it("falls back to localhost and BOT_API_PORT in development when unset", () => {
        withEnv(
            { API_PROXY_TARGET: undefined, NODE_ENV: "development", BOT_API_PORT: "4123" },
            () => {
                assert.equal(getBotApiOrigin(), "http://localhost:4123")
            }
        )
        withEnv(
            { API_PROXY_TARGET: "   ", NODE_ENV: "development", BOT_API_PORT: undefined },
            () => {
                assert.equal(getBotApiOrigin(), "http://localhost:3001")
            }
        )
    })

    it("accepts http/https origins and strips trailing slashes", () => {
        withEnv({ API_PROXY_TARGET: "https://bot.example.com/" }, () => {
            assert.equal(getBotApiOrigin(), "https://bot.example.com")
        })
        withEnv({ API_PROXY_TARGET: "http://127.0.0.1:3001///" }, () => {
            assert.equal(getBotApiOrigin(), "http://127.0.0.1:3001")
        })
    })

    it("rejects invalid URLs, non-http protocols, and non-origin shapes", () => {
        withEnv({ API_PROXY_TARGET: "not a url" }, () => {
            assert.throws(() => getBotApiOrigin(), /not a valid URL/)
        })
        withEnv({ API_PROXY_TARGET: "ftp://bot.example.com" }, () => {
            assert.throws(() => getBotApiOrigin(), /protocol must be http or https/)
        })
        withEnv({ API_PROXY_TARGET: "https://bot.example.com/api" }, () => {
            assert.throws(() => getBotApiOrigin(), /origin-only URL/)
        })
        withEnv({ API_PROXY_TARGET: "https://bot.example.com?x=1" }, () => {
            assert.throws(() => getBotApiOrigin(), /origin-only URL/)
        })
        withEnv({ API_PROXY_TARGET: "https://bot.example.com#frag" }, () => {
            assert.throws(() => getBotApiOrigin(), /origin-only URL/)
        })
        withEnv({ API_PROXY_TARGET: "https://user:pass@bot.example.com" }, () => {
            assert.throws(() => getBotApiOrigin(), /origin-only URL/)
        })
    })
})
