import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isDiscordSnowflake } from "./discord-user-id.js"

describe("isDiscordSnowflake", () => {
    it("accepts typical Discord snowflakes after trim", () => {
        assert.equal(isDiscordSnowflake("12345678901234567"), true) // 17
        assert.equal(isDiscordSnowflake("123456789012345678"), true) // 18
        assert.equal(isDiscordSnowflake("1234567890123456789"), true) // 19
        assert.equal(isDiscordSnowflake("1234567890123456789012"), true) // 22
        assert.equal(isDiscordSnowflake("  123456789012345678  "), true)
    })

    it("rejects too-short, too-long, non-digit, and empty values", () => {
        assert.equal(isDiscordSnowflake("1234567890123456"), false) // 16
        assert.equal(isDiscordSnowflake("12345678901234567890123"), false) // 23
        assert.equal(isDiscordSnowflake("12345678901234567a"), false)
        assert.equal(isDiscordSnowflake("not-a-snowflake"), false)
        assert.equal(isDiscordSnowflake(""), false)
        assert.equal(isDiscordSnowflake("   "), false)
    })
})
