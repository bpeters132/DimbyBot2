/**
 * Re-exports Discord OAuth user-guild fetch from root `src/util` so the Next app and bot share one implementation.
 * The bot must import `discordUserGuilds.js` directly from `dist/util/` (root `tsc` does not compile `src/web`).
 */
export {
    fetchDiscordUserGuilds,
    type DiscordUserGuild,
    type FetchUserGuildsResult,
} from "../../util/discordUserGuilds.js"

const DISCORD_USER_API_UA = "DimbyBotDashboard/1.0 (OAuth user token)"

/** Resolves the Discord snowflake for the bearer token (`identify` scope). */
export async function fetchDiscordCurrentUserId(accessToken: string): Promise<string | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
        const response = await fetch("https://discord.com/api/v10/users/@me", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "User-Agent": DISCORD_USER_API_UA,
            },
            signal: controller.signal,
        })
        if (!response.ok) return null
        const data = (await response.json()) as { id?: string }
        if (typeof data.id !== "string" || !/^\d{17,22}$/.test(data.id.trim())) {
            return null
        }
        return data.id.trim()
    } catch {
        return null
    } finally {
        clearTimeout(timeout)
    }
}
