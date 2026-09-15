/** Coarse failure bucket for UI hints (derived from error text only; no secrets). */
export type SessionReadFailureKind =
    | "database_connectivity"
    | "database_schema"
    | "auth_configuration"
    | "unknown"

/**
 * Maps auth/session error text to a coarse UI hint bucket.
 * Keep this pure (no Next/auth imports) so unit tests do not pull the auth stack.
 */
export function classifyAuthSessionFailure(rawMessage: string): SessionReadFailureKind {
    const m = rawMessage.toLowerCase()
    if (
        /\bp1001\b/i.test(rawMessage) ||
        /\beconnrefused\b/i.test(rawMessage) ||
        m.includes("can't reach database server") ||
        m.includes("cannot reach database") ||
        m.includes("connection refused") ||
        m.includes("connect econnrefused") ||
        m.includes("econnreset") ||
        m.includes("etimedout") ||
        /\benotfound\b/i.test(rawMessage)
    ) {
        return "database_connectivity"
    }
    if (
        m.includes("does not exist") ||
        m.includes("relation ") ||
        /\bp2021\b/i.test(rawMessage) ||
        m.includes("unknown table") ||
        m.includes("no such table")
    ) {
        return "database_schema"
    }
    if (
        m.includes("decrypt") ||
        m.includes("jwe") ||
        (m.includes("jwt") && m.includes("invalid")) ||
        m.includes("invalid signing key") ||
        m.includes("session token")
    ) {
        return "auth_configuration"
    }
    return "unknown"
}
