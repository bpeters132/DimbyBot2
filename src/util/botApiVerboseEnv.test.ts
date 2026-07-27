import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isBotApiVerbose } from "./botApiVerboseEnv.js"

describe("isBotApiVerbose", () => {
    it("treats BOT_API_VERBOSE / WEB_BOT_API_VERBOSE truthy flags as enabled", () => {
        const prevBot = process.env.BOT_API_VERBOSE
        const prevWeb = process.env.WEB_BOT_API_VERBOSE
        try {
            delete process.env.BOT_API_VERBOSE
            delete process.env.WEB_BOT_API_VERBOSE
            assert.equal(isBotApiVerbose(), false)

            process.env.BOT_API_VERBOSE = "1"
            assert.equal(isBotApiVerbose(), true)

            // Non-empty BOT_API_VERBOSE wins over WEB (including falsy-looking "0").
            process.env.BOT_API_VERBOSE = "0"
            process.env.WEB_BOT_API_VERBOSE = "yes"
            assert.equal(isBotApiVerbose(), false)

            delete process.env.BOT_API_VERBOSE
            process.env.WEB_BOT_API_VERBOSE = "yes"
            assert.equal(isBotApiVerbose(), true)

            process.env.WEB_BOT_API_VERBOSE = " off "
            assert.equal(isBotApiVerbose(), false)

            process.env.BOT_API_VERBOSE = "TRUE"
            assert.equal(isBotApiVerbose(), true)
        } finally {
            if (prevBot === undefined) delete process.env.BOT_API_VERBOSE
            else process.env.BOT_API_VERBOSE = prevBot
            if (prevWeb === undefined) delete process.env.WEB_BOT_API_VERBOSE
            else process.env.WEB_BOT_API_VERBOSE = prevWeb
        }
    })
})
