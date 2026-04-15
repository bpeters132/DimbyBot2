/**
 * Builds links to the Next.js web dashboard using `BETTER_AUTH_URL` (public origin, no path).
 * The bot container should set the same value as the dashboard for consistent OAuth/cookies.
 */

/** Guild-scoped web player / queue page under the dashboard app. */
export function guildWebPlayerPageUrl(guildId: string): string | null {
    const raw = process.env.BETTER_AUTH_URL?.trim()
    if (!raw) return null
    try {
        const normalized = raw.replace(/\/+$/, "")
        const base = new URL(normalized)
        if (base.protocol !== "http:" && base.protocol !== "https:") return null
        return `${base.origin}/dashboard/${encodeURIComponent(guildId)}`
    } catch {
        return null
    }
}

/** Extra copy for slash-command replies when a new Lavalink player was created. */
export function webDashboardPromoAppend(guildId: string): string {
    const url = guildWebPlayerPageUrl(guildId)
    if (!url) return ""
    return `\n\n**Web player:** Check out the new [dashboard](${url}) in your browser for queue and playback controls for this server!`
}
