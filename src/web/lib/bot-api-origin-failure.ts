export type ServerFetchBotOriginFailureKind = "invalid" | "unset"

export type ServerFetchBotOriginFailure = {
    status: 503
    body: {
        ok: false
        error: {
            error: "Bot API misconfigured" | "Bot API not configured"
            details: string
        }
    }
}

/**
 * Maps `serverFetchBot` origin setup failures to the nested Dashboard action envelope.
 * Invalid `API_PROXY_TARGET` and a missing origin are both 503, but the copy must stay distinct
 * so operators do not treat a bad URL as "not configured" (or the reverse).
 * Distinct from {@link resolveBotApiFetchFailure} 502/504 and from status-page origin probe copy.
 */
export function mapServerFetchBotOriginFailure(
    kind: ServerFetchBotOriginFailureKind
): ServerFetchBotOriginFailure {
    if (kind === "invalid") {
        return {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Bot API misconfigured",
                    details: "Bot API misconfigured",
                },
            },
        }
    }
    return {
        status: 503,
        body: {
            ok: false,
            error: {
                error: "Bot API not configured",
                details:
                    "Set API_PROXY_TARGET to the bot HTTP origin (e.g. http://localhost:3001).",
            },
        },
    }
}
