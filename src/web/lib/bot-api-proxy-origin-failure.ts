export type ProxyBotApiOriginFailureKind = "invalid" | "unset"

export type ProxyBotApiOriginFailure = {
    status: 503
    body: {
        ok: false
        error: "Bot API misconfigured" | "Bot API not configured"
        details: string
    }
}

/**
 * Maps `proxyBotApi` origin setup failures to the flat Dashboard proxy envelope.
 * Invalid `API_PROXY_TARGET` and a missing origin are both 503, but the copy must stay distinct
 * so operators do not treat a bad URL as "not configured" (or the reverse).
 * Distinct from {@link mapServerFetchBotOriginFailure} (nested `{ error: { error, details } }`)
 * and from {@link resolveBotApiProxyFetchFailure} 502/504.
 */
export function mapProxyBotApiOriginFailure(
    kind: ProxyBotApiOriginFailureKind
): ProxyBotApiOriginFailure {
    if (kind === "invalid") {
        return {
            status: 503,
            body: {
                ok: false,
                error: "Bot API misconfigured",
                details: "Bot API misconfigured",
            },
        }
    }
    return {
        status: 503,
        body: {
            ok: false,
            error: "Bot API not configured",
            details: "Set API_PROXY_TARGET to the bot HTTP origin (e.g. http://localhost:3001).",
        },
    }
}
