import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { mapVoiceContextIdentityFailure } from "../../src/botApi/voiceContextIdentity.js"

describe("mapVoiceContextIdentityFailure", () => {
    it("returns 403 when the session has no Discord snowflake, even if the bot is down", () => {
        const missing = {
            ok: false as const,
            status: 403 as const,
            error: "Discord account required",
            details: "Could not resolve your Discord user id.",
        }
        assert.deepEqual(
            mapVoiceContextIdentityFailure({ discordUserId: null, botReady: true }),
            missing
        )
        assert.deepEqual(
            mapVoiceContextIdentityFailure({ discordUserId: undefined, botReady: false }),
            missing
        )
        assert.deepEqual(
            mapVoiceContextIdentityFailure({ discordUserId: "", botReady: true }),
            missing
        )
    })

    it("returns 503 when Discord is linked but the bot process is not ready", () => {
        assert.deepEqual(
            mapVoiceContextIdentityFailure({
                discordUserId: "123456789012345678",
                botReady: false,
            }),
            {
                ok: false,
                status: 503,
                error: "Bot is starting up",
                details: "The Discord bot is not connected yet.",
            }
        )
    })

    it("allows the handler to continue when Discord is linked and the bot is ready", () => {
        assert.deepEqual(
            mapVoiceContextIdentityFailure({
                discordUserId: "123456789012345678",
                botReady: true,
            }),
            { ok: true }
        )
    })
})
