import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolvedBotApiPort } from "./botApiPortEnv.js"

describe("resolvedBotApiPort", () => {
    it("defaults to 3001 when unset or whitespace", () => {
        const prev = process.env.BOT_API_PORT
        try {
            delete process.env.BOT_API_PORT
            assert.equal(resolvedBotApiPort(), 3001)
            process.env.BOT_API_PORT = "   "
            assert.equal(resolvedBotApiPort(), 3001)
        } finally {
            if (prev === undefined) delete process.env.BOT_API_PORT
            else process.env.BOT_API_PORT = prev
        }
    })

    it("accepts integers in 1–65535 and rejects floats, zero, and out-of-range", () => {
        const prev = process.env.BOT_API_PORT
        try {
            process.env.BOT_API_PORT = "1"
            assert.equal(resolvedBotApiPort(), 1)
            process.env.BOT_API_PORT = "65535"
            assert.equal(resolvedBotApiPort(), 65535)
            process.env.BOT_API_PORT = "8080"
            assert.equal(resolvedBotApiPort(), 8080)

            process.env.BOT_API_PORT = "0"
            assert.equal(resolvedBotApiPort(), 3001)
            process.env.BOT_API_PORT = "65536"
            assert.equal(resolvedBotApiPort(), 3001)
            process.env.BOT_API_PORT = "3001.5"
            assert.equal(resolvedBotApiPort(), 3001)
            process.env.BOT_API_PORT = "abc"
            assert.equal(resolvedBotApiPort(), 3001)
            process.env.BOT_API_PORT = "-1"
            assert.equal(resolvedBotApiPort(), 3001)
        } finally {
            if (prev === undefined) delete process.env.BOT_API_PORT
            else process.env.BOT_API_PORT = prev
        }
    })
})
