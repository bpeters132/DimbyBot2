export type ResolveSeekPositionResult =
    | { ok: true; seekMs: number }
    | { ok: false; reason: "past_end"; durationSec: number }

/**
 * Clamps a `/seek` position (seconds) to a track duration (ms).
 * Streams / unknown duration (`durationMs <= 0`) accept any non-negative position.
 * Positions past the end of a finite track are rejected (caller shows durationSec).
 */
export function resolveSeekPositionMs(
    positionSec: number,
    durationMs: number
): ResolveSeekPositionResult {
    const safePositionSec = Number.isFinite(positionSec) ? Math.max(0, positionSec) : 0
    const safeDurationMs =
        Number.isFinite(durationMs) && durationMs > 0 ? Math.max(0, durationMs) : 0
    const durationSec = Math.max(0, Math.floor(safeDurationMs / 1000))

    if (durationSec > 0 && safePositionSec > durationSec) {
        return { ok: false, reason: "past_end", durationSec }
    }

    const seekMs = Math.min(
        Math.max(0, safePositionSec * 1000),
        safeDurationMs > 0 ? safeDurationMs : Number.MAX_SAFE_INTEGER
    )
    return { ok: true, seekMs }
}
