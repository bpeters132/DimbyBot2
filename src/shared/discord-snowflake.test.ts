import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizeOptionalDiscordSnowflake } from "./discord-snowflake.js"

describe("normalizeOptionalDiscordSnowflake", () => {
    it("accepts trimmed positive digit snowflakes within uint64", () => {
        assert.equal(normalizeOptionalDiscordSnowflake("1"), "1")
        assert.equal(
            normalizeOptionalDiscordSnowflake(" 123456789012345678 "),
            "123456789012345678"
        )
        assert.equal(
            normalizeOptionalDiscordSnowflake("18446744073709551615"),
            "18446744073709551615"
        )
    })

    it("rejects non-strings, empty, non-digits, zero, and oversized values", () => {
        assert.equal(normalizeOptionalDiscordSnowflake(null), null)
        assert.equal(normalizeOptionalDiscordSnowflake(123), null)
        assert.equal(normalizeOptionalDiscordSnowflake(""), null)
        assert.equal(normalizeOptionalDiscordSnowflake("   "), null)
        assert.equal(normalizeOptionalDiscordSnowflake("12a"), null)
        assert.equal(normalizeOptionalDiscordSnowflake("0"), null)
        assert.equal(normalizeOptionalDiscordSnowflake("-1"), null)
        // 21 digits fails the length regex before BigInt bounds
        assert.equal(normalizeOptionalDiscordSnowflake("100000000000000000000"), null)
        // 20 digits above uint64 max
        assert.equal(normalizeOptionalDiscordSnowflake("18446744073709551616"), null)
    })
})
