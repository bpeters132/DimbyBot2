import type { SkipCurrentTrackResult } from "./skipCurrentTrack.js"

/** Discord `/skip` and control-button copy when prepare is still in flight. */
export const SKIP_DEFERRED_USER_MESSAGE =
    "Could not skip right now. The next track is still preparing. Try again in a moment."

/** Stable bot-API error code for a deferred skip (must stay 409, not 200). */
export const SKIP_DEFERRED_API_ERROR = "next_track_not_ready" as const

export const SKIP_DEFERRED_API_DETAILS =
    "The next track is still preparing. Try skip again in a moment."

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

/**
 * Maps {@link skipCurrentTrack} outcomes to the web player skip HTTP contract.
 * Returns `null` when skip succeeded; otherwise a 409 the dashboard must treat as not skipped.
 */
export function playerHttpResultForSkip(
    result: SkipCurrentTrackResult
): PlayerSkipDeferredHttpResult | null {
    if (result !== "deferred") return null
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
