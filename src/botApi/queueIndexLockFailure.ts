/** Why a queue index DELETE/PATCH failed after the guild queue lock ran. */
export type QueueIndexLockFailureReason = "no_player" | "out_of_range"

/**
 * Maps live-player / bounds failures for dashboard queue index mutations.
 * Both reasons stay HTTP 404 (not 409 live-player race, not 400 parse).
 * Parse failures for the path/body indexes remain 400 in the handler.
 */
export function mapQueueIndexLockFailure(reason: QueueIndexLockFailureReason): {
    status: 404
    error: string
} {
    if (reason === "no_player") {
        return { status: 404, error: "No active player for this guild." }
    }
    return { status: 404, error: "Queue index out of range." }
}
