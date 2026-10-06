/**
 * Maps Dashboard Next `guardGuildAccess` outcomes.
 * Access denials keep the guild-access HTTP status (401/403/503). Unexpected throws are 500
 * with an INTERNAL_ERROR details object — do not collapse either envelope into the other.
 */

export type GuildApiRouteGuardAccessDenied = {
    status: number
    body: {
        ok: false
        status: number
        error: string
        details?: string
    }
}

export type GuildApiRouteGuardUnexpectedFailure = {
    status: 500
    body: {
        ok: false
        status: 500
        error: "Internal error"
        details: { code: "INTERNAL_ERROR" }
    }
}

/** Forwards `resolveAuthenticatedGuildAccess` denial status and copy. */
export function mapGuildApiRouteGuardAccessDenied(denied: {
    status: number
    error: string
    details?: string
}): GuildApiRouteGuardAccessDenied {
    return {
        status: denied.status,
        body: {
            ok: false,
            status: denied.status,
            error: denied.error,
            details: denied.details,
        },
    }
}

/** Unexpected throw while reading headers or calling the access helper. */
export function mapGuildApiRouteGuardUnexpectedFailure(): GuildApiRouteGuardUnexpectedFailure {
    return {
        status: 500,
        body: {
            ok: false,
            status: 500,
            error: "Internal error",
            details: { code: "INTERNAL_ERROR" },
        },
    }
}
