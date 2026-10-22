/**
 * `/stop` and `/leave` bump a per-guild epoch so an in-flight `playLocalFile`
 * (Ready wait after Lavalink handoff) aborts before starting audio.
 */

/** Stored epoch when nothing has cancelled yet. */
export function readLocalPlayCancelEpoch(stored: number | undefined): number {
    return stored ?? 0
}

/** Next epoch after `/stop` or `/leave`. Missing storage starts at 1. */
export function nextLocalPlayCancelEpoch(stored: number | undefined): number {
    return readLocalPlayCancelEpoch(stored) + 1
}

/**
 * True when a cancel bumped the epoch after this play captured `startEpoch`.
 * Equal epochs (including both 0) mean this play is still the current attempt.
 */
export function isLocalPlayCancelledByEpoch(
    stored: number | undefined,
    startEpoch: number
): boolean {
    return readLocalPlayCancelEpoch(stored) !== startEpoch
}
