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
        const id = typeof data.id === "string" ? data.id.trim() : ""
        if (!id || !/^\d{17,22}$/.test(id)) {
            return null
        }
        return id
    } catch {
        return null
    } finally {
        clearTimeout(timeout)
    }
}
