export type GuildAccessHttpFailure = {
    ok: false
    status: 503 | 403
    error: string
    details: string
}

/**
 * Maps a guild-access verification failure into the HTTP shape used by guild-scoped dashboard/bot
 * API guards. Transient Discord/OAuth failures stay 503 so they are not shown as Forbidden.
 */
export function mapGuildAccessFailureToHttp(failure: {
    retryable: boolean
    error?: string
}): GuildAccessHttpFailure {
    const retryable = failure.retryable === true
    return {
        ok: false,
        status: retryable ? 503 : 403,
        error: retryable ? "Service temporarily unavailable" : "Forbidden",
        details: retryable
            ? (failure.error ??
              "Could not verify Discord membership right now. Try again in a moment.")
            : "Could not verify access to this server. The bot may not be in this guild, or your membership could not be confirmed (try re-logging in with Discord).",
    }
}
