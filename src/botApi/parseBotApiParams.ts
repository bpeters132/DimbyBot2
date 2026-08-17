/** Inclusive clamp used by dashboard queue pagination query parsing. */
export function clampInt(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * Parses a query integer, truncates toward zero, and clamps to inclusive bounds.
 * Non-finite / missing values return `fallback`.
 */
export function parseQueueQueryNumber(
    value: string | null,
    fallback: number,
    min: number,
    max: number
): number {
    if (value === null) return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return clampInt(Math.trunc(parsed), min, max)
}

/**
 * Parses a queue index path segment. Rejects non-integers and negatives
 * so DELETE/PATCH cannot coerce `1.5` / `-1` into unintended positions.
 */
export function parseQueueIndex(value: string): number | null {
    const index = Number(value)
    if (!Number.isInteger(index) || index < 0) {
        return null
    }
    return index
}

const PLAYER_ACTIONS = ["pause", "skip", "stop", "seek", "loop", "shuffle", "autoplay"] as const

export type PlayerAction = (typeof PLAYER_ACTIONS)[number]

/** Whitelists player control actions from JSON bodies. */
export function parsePlayerAction(value: unknown): PlayerAction | null {
    if (typeof value !== "string") return null
    return (PLAYER_ACTIONS as readonly string[]).includes(value) ? (value as PlayerAction) : null
}
