import { LIVE_PLAYER_RACE_HTTP_STATUS } from "./livePlayerRaceHttp.js"

/** Why a queue index DELETE/PATCH failed after the guild queue lock ran. */
export type QueueIndexLockFailureReason = "no_player" | "out_of_range" | "stale"

/** Stable bot-API error code when index delete/reorder raced a successor player. */
export const QUEUE_INDEX_STALE_API_ERROR = "player_replaced" as const

export const QUEUE_INDEX_STALE_API_DETAILS = "The player was replaced. Try again."

export type QueueIndexLockFailureHttp =
    | { status: 404; error: string }
    | {
          status: typeof LIVE_PLAYER_RACE_HTTP_STATUS
          error: typeof QUEUE_INDEX_STALE_API_ERROR
          details: typeof QUEUE_INDEX_STALE_API_DETAILS
      }

/**
 * Maps live-player / bounds failures for dashboard queue index mutations.
 * `no_player` / `out_of_range` stay HTTP 404 (not 409, not 400 parse).
 * `stale` (captured identity ≠ live successor) stays 409 so index splice cannot
 * mutate a `/stop`+`/play` session — same contract as dashboard queue clear.
 * Parse failures for the path/body indexes remain 400 in the handler.
 */
export function mapQueueIndexLockFailure(
    reason: QueueIndexLockFailureReason
): QueueIndexLockFailureHttp {
    if (reason === "stale") {
        return {
            status: LIVE_PLAYER_RACE_HTTP_STATUS,
            error: QUEUE_INDEX_STALE_API_ERROR,
            details: QUEUE_INDEX_STALE_API_DETAILS,
        }
    }
    if (reason === "no_player") {
        return { status: 404, error: "No active player for this guild." }
    }
    return { status: 404, error: "Queue index out of range." }
}
