import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { discordDeleteErrorDetails, getDiscordErrorCode } from "./discordErrorDetails.js"

describe("getDiscordErrorCode", () => {
    it("reads finite numeric codes from thrown Discord-like errors", () => {
        assert.equal(getDiscordErrorCode({ code: 10003 }), 10003)
        assert.equal(getDiscordErrorCode({ code: 0 }), 0)
    })

    it("parses digit-only string codes used by some discord.js surfaces", () => {
        assert.equal(getDiscordErrorCode({ code: "10004" }), 10004)
    })

    it("rejects non-codes so callers do not misclassify network failures as Discord API errors", () => {
        assert.equal(getDiscordErrorCode(null), undefined)
        assert.equal(getDiscordErrorCode(undefined), undefined)
        assert.equal(getDiscordErrorCode("boom"), undefined)
        assert.equal(getDiscordErrorCode({}), undefined)
        assert.equal(getDiscordErrorCode({ code: "EAI_AGAIN" }), undefined)
        assert.equal(getDiscordErrorCode({ code: Number.NaN }), undefined)
        assert.equal(getDiscordErrorCode({ code: 12.5 }), undefined)
    })
})

describe("discordDeleteErrorDetails", () => {
    it("normalizes Error and non-Error throws for logging", () => {
        assert.deepEqual(discordDeleteErrorDetails(new Error("gone")), {
            code: undefined,
            message: "gone",
        })
        assert.deepEqual(discordDeleteErrorDetails({ code: "EAI_AGAIN", message: "dns" }), {
            code: "EAI_AGAIN",
            message: "[object Object]",
        })
        assert.deepEqual(discordDeleteErrorDetails({ code: 500 }), {
            code: "500",
            message: "[object Object]",
        })
    })
})
