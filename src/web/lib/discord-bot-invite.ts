/**
 * OAuth2 `permissions` for the bot install URL. Must stay aligned with
 * `BOT_INVITE_PERMISSION_FLAGS` in `src/botApi/handlers/guildList.ts`.
 */
const DISCORD_BOT_INVITE_PERMISSIONS = "3271680"

/**
 * Discord bot authorization URL for "Add to server", using the same app id as OAuth (`CLIENT_ID`).
 * Returns null only when `CLIENT_ID` is unset (e.g. misconfigured dashboard).
 */
export function getDiscordBotInviteUrl(): string | null {
    const clientId = process.env.CLIENT_ID?.trim()
    if (!clientId) {
        return null
    }
    return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${DISCORD_BOT_INVITE_PERMISSIONS}&scope=bot%20applications.commands`
}
