/** HTTP failure when voice-context cannot identify the viewer or the bot is not ready. */
export type VoiceContextIdentityFailure = {
    ok: false
    status: 403 | 503
    error: string
    details: string
}

/**
 * Maps identity/readiness for `GET /voice-context`.
 * Missing Discord snowflake is 403 even if the bot is also down (unlinked account, not an outage).
 * Linked Discord + no in-process bot is 503.
 */
export function mapVoiceContextIdentityFailure(input: {
    discordUserId: string | null | undefined
    botReady: boolean
}): { ok: true } | VoiceContextIdentityFailure {
    if (!input.discordUserId) {
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
            details: "Could not resolve your Discord user id.",
        }
    }
    if (!input.botReady) {
        return {
            ok: false,
            status: 503,
            error: "Bot is starting up",
            details: "The Discord bot is not connected yet.",
        }
    }
    return { ok: true }
}
