/** Last subscribe attempt recorded for debounce / reuse. */
export type SubscribeLastAttempt = {
    guildId: string
    at: number
    success: boolean
}

export type SubscribeDebounceDecision =
    | { action: "proceed" }
    | { action: "reuse"; success: boolean }

/**
 * Same-guild subscribe attempts within `debounceMs` reuse the prior outcome instead of
 * re-resolving permissions (avoids hammering Discord/bot permission lookups).
 */
export function evaluateSubscribeDebounce(
    last: SubscribeLastAttempt | undefined,
    guildId: string,
    nowMs: number,
    debounceMs: number
): SubscribeDebounceDecision {
    if (last && last.guildId === guildId && nowMs - last.at < debounceMs) {
        return { action: "reuse", success: last.success }
    }
    return { action: "proceed" }
}

/**
 * True when an older in-flight subscribe finished after a newer attempt started.
 * Callers must ignore stale completions so a slow permission resolve cannot replace
 * a newer guild subscription.
 */
export function isStaleSubscribeAttempt(
    currentGeneration: number | undefined,
    attemptGeneration: number
): boolean {
    return currentGeneration !== attemptGeneration
}
