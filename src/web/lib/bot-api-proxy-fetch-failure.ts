/** Classifies a failed `proxyBotApi` `fetch()` throw into Dashboard HTTP status + copy. */
export type BotApiProxyFetchFailureKind = "timeout" | "unreachable"

export type BotApiProxyFetchFailure = {
    kind: BotApiProxyFetchFailureKind
    status: 504 | 502
    body: {
        ok: false
        error: "Bot API timeout" | "Bot API unreachable"
        details: "Upstream bot API request timed out." | "Upstream bot API request failed."
    }
}

/**
 * True when the throw is a named `AbortError` (proxy timeout abort).
 * Message text is ignored so a transport error whose message happens to include "abort" stays 502.
 */
export function isBotApiProxyFetchAbort(error: unknown): boolean {
    if (error instanceof DOMException) {
        return error.name === "AbortError"
    }
    return error instanceof Error && error.name === "AbortError"
}

/**
 * Maps a `proxyBotApi` fetch throw to 504 timeout vs 502 unreachable.
 * Keep proxy copy (`Bot API timeout` / 504) distinct from `serverFetchBot` timeout copy.
 */
export function resolveBotApiProxyFetchFailure(error: unknown): BotApiProxyFetchFailure {
    if (isBotApiProxyFetchAbort(error)) {
        return {
            kind: "timeout",
            status: 504,
            body: {
                ok: false,
                error: "Bot API timeout",
                details: "Upstream bot API request timed out.",
            },
        }
    }
    return {
        kind: "unreachable",
        status: 502,
        body: {
            ok: false,
            error: "Bot API unreachable",
            details: "Upstream bot API request failed.",
        },
    }
}
