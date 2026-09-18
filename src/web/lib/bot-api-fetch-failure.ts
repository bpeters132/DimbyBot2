/** Classifies a failed `serverFetchBot` `fetch()` throw into Dashboard HTTP status + copy. */
export type BotApiFetchFailureKind = "timeout" | "unreachable"

export type BotApiFetchFailure = {
    kind: BotApiFetchFailureKind
    status: 504 | 502
    error: string
    details: string
}

/** True when the throw is an abort/timeout rather than a transport failure. */
export function isBotApiFetchAbort(error: unknown): boolean {
    if (
        error instanceof Error &&
        (error.name === "AbortError" || /aborted|abort/i.test(error.message))
    ) {
        return true
    }
    return (
        typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError"
    )
}

/**
 * Maps a `fetch` throw to 504 timeout vs 502 unreachable.
 * Abort/timeout must not be reported as "Bot API unreachable" (and vice versa).
 */
export function resolveBotApiFetchFailure(error: unknown): BotApiFetchFailure {
    if (isBotApiFetchAbort(error)) {
        return {
            kind: "timeout",
            status: 504,
            error: "Bot API request timed out",
            details: "Upstream bot did not respond before the timeout.",
        }
    }
    return {
        kind: "unreachable",
        status: 502,
        error: "Bot API unreachable",
        details: "Unable to reach Bot API",
    }
}
