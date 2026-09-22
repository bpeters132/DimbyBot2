export type GuildsRouteAuthFailure = {
    status: 401 | 502
    body: { error: "Unauthorized" | "Auth service unavailable" }
    /** Raw `status`/`statusCode` from the thrown value, for logs only. */
    lookupStatus: unknown
}

/**
 * Maps thrown Better Auth session lookup errors for Dashboard `GET /api/guilds`.
 * 401/403 collapse to Unauthorized; any other status (or missing status) is Auth service unavailable.
 * `status` wins over `statusCode` when `status` is a number.
 */
export function mapGuildsRouteAuthLookupFailure(err: unknown): GuildsRouteAuthFailure {
    const status =
        typeof err === "object" && err !== null && "status" in err
            ? (err as { status?: unknown }).status
            : undefined
    const statusCode =
        typeof err === "object" && err !== null && "statusCode" in err
            ? (err as { statusCode?: unknown }).statusCode
            : undefined
    const numericStatus = typeof status === "number" ? status : statusCode
    if (numericStatus === 401 || numericStatus === 403) {
        return { status: 401, body: { error: "Unauthorized" }, lookupStatus: numericStatus }
    }
    return {
        status: 502,
        body: { error: "Auth service unavailable" },
        lookupStatus: numericStatus,
    }
}
