/**
 * Re-exports Discord OAuth user-guild fetch from root `src/util` so the Next app and bot share one implementation.
 * The bot must import `discordUserGuilds.js` directly from `dist/util/` (root `tsc` does not compile `src/web`).
 */
export {
    fetchDiscordUserGuilds,
    type DiscordUserGuild,
    type FetchUserGuildsResult,
} from "../util/discordUserGuilds.js"

const DISCORD_USER_API_UA = "DimbyBotDashboard/1.0 (OAuth user token)"
const DISCORD_USERS_ME_SNOWFLAKE_RE = /^\d{17,22}$/

/**
 * Parses `GET /users/@me` JSON for a Discord snowflake.
 * Ids must be strings — JSON numbers cannot represent snowflakes above `Number.MAX_SAFE_INTEGER`.
 */
export function parseDiscordUsersMeId(data: unknown): string | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    const raw = (data as { id?: unknown }).id
    if (typeof raw !== "string") return null
    const id = raw.trim()
    if (!id || !DISCORD_USERS_ME_SNOWFLAKE_RE.test(id)) return null
    return id
}

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
        return parseDiscordUsersMeId(await response.json())
    } catch {
        return null
    } finally {
        clearTimeout(timeout)
    }
}
