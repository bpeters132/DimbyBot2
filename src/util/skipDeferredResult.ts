import type { SkipCurrentTrackResult } from "./skipCurrentTrack.js"

/** Discord `/skip` and control-button copy when prepare is still in flight. */
export const SKIP_DEFERRED_USER_MESSAGE =
    "Could not skip right now. The next track is still preparing. Try again in a moment."

/** Stable bot-API error code for a deferred skip (must stay 409, not 200). */
export const SKIP_DEFERRED_API_ERROR = "next_track_not_ready" as const

export const SKIP_DEFERRED_API_DETAILS =
    "The next track is still preparing. Try skip again in a moment."

/** Stable bot-API error code when skip raced with a successor player (must stay 409, not 200). */
export const SKIP_STALE_API_ERROR = "player_replaced" as const

export const SKIP_STALE_API_DETAILS = "The player was replaced. Try skip again."

export type PlayerSkipDeferredHttpResult = {
    status: 409
    body: {
        ok: false
        error: {
            error: typeof SKIP_DEFERRED_API_ERROR
            details: typeof SKIP_DEFERRED_API_DETAILS
        }
    }
}

export type PlayerSkipStaleHttpResult = {
    status: 409
    body: {
        ok: false
        error: {
            error: typeof SKIP_STALE_API_ERROR
            details: typeof SKIP_STALE_API_DETAILS
        }
    }
}

export type PlayerSkipConflictHttpResult = PlayerSkipDeferredHttpResult | PlayerSkipStaleHttpResult

/**
 * Maps {@link skipCurrentTrack} outcomes to the web player skip HTTP contract.
 * Returns `null` when skip succeeded; otherwise a 409 the dashboard must treat as not skipped.
 * Stale (successor/destroy) stays `player_replaced` — do not collapse it into `next_track_not_ready`.
 */
export function playerHttpResultForSkip(
    result: SkipCurrentTrackResult
): PlayerSkipConflictHttpResult | null {
    if (result === "skipped") return null
    if (result === "stale") {
        return {
            status: 409,
            body: {
                ok: false,
                error: {
                    error: SKIP_STALE_API_ERROR,
                    details: SKIP_STALE_API_DETAILS,
                },
            },
        }
    }
    if (result === "deferred") {
        return {
            status: 409,
            body: {
                ok: false,
                error: {
                    error: SKIP_DEFERRED_API_ERROR,
                    details: SKIP_DEFERRED_API_DETAILS,
                },
            },
        }
    }
    return null
}
