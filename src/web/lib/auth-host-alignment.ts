import { normalizeAuthHost } from "@/shared/normalize-auth-host.js"

/** First comma-separated forwarded value, trimmed. Empty entries are treated as missing. */
export function firstForwardedValue(header: string | null | undefined): string | null {
    const first = header?.split(",")[0]?.trim()
    return first ? first : null
}

/**
 * Maps `x-forwarded-proto` to a URL protocol. Only `http` / `https` are trusted;
 * anything else falls back to the Next request protocol.
 */
export function requestProtocolFromForwarded(
    forwardedProto: string | null | undefined,
    fallbackProtocol: string
): string {
    const proto = firstForwardedValue(forwardedProto)?.toLowerCase()
    if (proto === "http") return "http:"
    if (proto === "https") return "https:"
    return fallbackProtocol
}

export type AuthHostAlignment =
    | { kind: "unconfigured" }
    | { kind: "invalid_config" }
    | { kind: "aligned" }
    | { kind: "no_request_host" }
    | { kind: "mismatch"; normalizedHost: string; normalizedExpectedHost: string }

/**
 * Compares the incoming Host (preferring `x-forwarded-host`) to `BETTER_AUTH_URL`.
 * Used by the dashboard proxy to log www/scheme drift that breaks OAuth cookies.
 */
export function resolveAuthHostAlignment(input: {
    configuredUrl: string | undefined
    forwardedHost: string | null
    hostHeader: string | null
    fallbackHost: string
    forwardedProto: string | null
    fallbackProtocol: string
}): AuthHostAlignment {
    const configuredUrl = input.configuredUrl?.trim()
    if (!configuredUrl) {
        return { kind: "unconfigured" }
    }

    let expected: URL
    try {
        expected = new URL(configuredUrl)
    } catch {
        return { kind: "invalid_config" }
    }

    const host =
        firstForwardedValue(input.forwardedHost) || input.hostHeader?.trim() || input.fallbackHost
    const requestProtocol = requestProtocolFromForwarded(
        input.forwardedProto,
        input.fallbackProtocol
    )
    const normalizedHost = host ? normalizeAuthHost(host, requestProtocol) : null
    if (!normalizedHost) {
        return { kind: "no_request_host" }
    }
    const normalizedExpectedHost = normalizeAuthHost(expected.host, expected.protocol)
    if (normalizedHost !== normalizedExpectedHost) {
        return { kind: "mismatch", normalizedHost, normalizedExpectedHost }
    }
    return { kind: "aligned" }
}
