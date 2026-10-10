import { LIVE_PLAYER_RACE_HTTP_STATUS } from "./livePlayerRaceHttp.js"

/** Stable bot-API error code when dashboard clear raced a successor player (must stay 409, not 200). */
export const QUEUE_CLEAR_STALE_API_ERROR = "player_replaced" as const

export const QUEUE_CLEAR_STALE_API_DETAILS = "The player was replaced. Try again."

export type QueueClearStaleReplacedHttp = {
    kind: "replaced"
    status: typeof LIVE_PLAYER_RACE_HTTP_STATUS
    error: {
        error: typeof QUEUE_CLEAR_STALE_API_ERROR
        details: typeof QUEUE_CLEAR_STALE_API_DETAILS
    }
}

export type QueueClearStaleDestroyed = { kind: "destroyed" }

export type QueueClearStaleHttp = QueueClearStaleReplacedHttp | QueueClearStaleDestroyed

/**
 * Maps `clearUpcomingOnLivePlayer` `"stale"` after a captured identity miss.
 * A live successor stays 409 so dashboard clear cannot splice the new session's upcoming.
 * A destroyed slot is already empty — the handler returns 200 with no `queueUpdate` broadcast.
 */
export function mapQueueClearStale(live: unknown): QueueClearStaleHttp {
    if (live) {
        return {
            kind: "replaced",
            status: LIVE_PLAYER_RACE_HTTP_STATUS,
            error: {
                error: QUEUE_CLEAR_STALE_API_ERROR,
                details: QUEUE_CLEAR_STALE_API_DETAILS,
            },
        }
    }
    return { kind: "destroyed" }
}
