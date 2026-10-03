import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapGuildListSetupFailure } from "./guildListSetupFailure.js"

describe("mapGuildListSetupFailure", () => {
    it("maps a getAccessToken throw to 500, not 403 missing-token", () => {
        const mapped = mapGuildListSetupFailure("access_token_threw")
        assert.deepEqual(mapped, {
            status: 500,
            error: "Failed to retrieve Discord access token.",
            details: "Internal server error.",
        })
        assert.notEqual(mapped.status, 403)
        assert.notEqual(mapped.error, "Forbidden")
    })

    it("maps a missing Discord access token to 403, not 401 or 500", () => {
        const mapped = mapGuildListSetupFailure("access_token_missing")
        assert.deepEqual(mapped, {
            status: 403,
            error: "Forbidden",
            details: "Missing Discord access token.",
        })
        assert.notEqual(mapped.status, 401)
        assert.notEqual(mapped.status, 500)
    })

    it("maps an unexpected Discord guilds fetch throw to 502, not bot-down 503", () => {
        const mapped = mapGuildListSetupFailure("discord_guilds_threw")
        assert.deepEqual(mapped, {
            status: 502,
            error: "Discord API request failed.",
            details: "Discord API request failed.",
        })
        assert.notEqual(mapped.status, 503)
        assert.notEqual(mapped.error, "Bot is starting up")
    })

    it("maps an unready bot to 503 with guild-list copy, not Discord 502", () => {
        const mapped = mapGuildListSetupFailure("bot_not_ready")
        assert.deepEqual(mapped, {
            status: 503,
            error: "Bot is starting up",
            details:
                "The Discord bot is not connected yet, so mutual servers cannot be listed. Try again in a moment.",
        })
        assert.notEqual(mapped.status, 502)
        assert.notEqual(mapped.error, "Discord API request failed.")
    })
})
