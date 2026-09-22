/**
 * Maps Discord `/users/@me/guilds` failure `status` onto Bot API HTTP.
 * Finite 400–599 pass through (401 re-auth, 403 missing scope, 429 retry). Status 0
 * (timeout / network / invalid payload from {@link fetchDiscordUserGuilds}), 2xx/3xx,
 * and 600+ fail closed to 502 so Express never sends a non-HTTP status.
 */
export function mapDiscordGuildListFailureStatus(status: unknown): number {
    const upstreamStatus = typeof status === "number" && Number.isFinite(status) ? status : 502
    return upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 502
}
