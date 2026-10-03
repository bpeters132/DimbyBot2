/**
 * Post-session failures while building the dashboard guild list.
 * Distinct from {@link mapDiscordGuildListFailureStatus} (upstream Discord HTTP)
 * and from voice-context identity (missing snowflake vs bot-not-ready).
 */
export type GuildListSetupFailureKind =
    | "access_token_threw"
    | "access_token_missing"
    | "discord_guilds_threw"
    | "bot_not_ready"

export type GuildListSetupFailure = {
    status: 403 | 500 | 502 | 503
    error: string
    details: string
}

/**
 * Maps guild-list setup failures onto Bot API HTTP.
 * Token throw is 500 (Better Auth/internal), missing token is 403 (re-link Discord),
 * an unexpected Discord fetch throw is 502 (not bot-down 503), and an unready bot is 503.
 */
export function mapGuildListSetupFailure(kind: GuildListSetupFailureKind): GuildListSetupFailure {
    switch (kind) {
        case "access_token_threw":
            return {
                status: 500,
                error: "Failed to retrieve Discord access token.",
                details: "Internal server error.",
            }
        case "access_token_missing":
            return {
                status: 403,
                error: "Forbidden",
                details: "Missing Discord access token.",
            }
        case "discord_guilds_threw":
            return {
                status: 502,
                error: "Discord API request failed.",
                details: "Discord API request failed.",
            }
        case "bot_not_ready":
            return {
                status: 503,
                error: "Bot is starting up",
                details:
                    "The Discord bot is not connected yet, so mutual servers cannot be listed. Try again in a moment.",
            }
    }
}
