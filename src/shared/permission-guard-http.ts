/**
 * HTTP shapes for guild-scoped permission guards in {@link requirePermissions} /
 * {@link resolveAuthenticatedGuildAccess}.
 * Resolution outages stay 503 (retry); missing roles and unresolved Discord ids stay 403
 * (not Unauthorized, not Service Unavailable).
 */

export type PermissionGuardUnavailable = {
    ok: false
    status: 503
    error: "Service Unavailable"
    details: string
}

export type PermissionGuardForbidden = {
    ok: false
    status: 403
    error: "Forbidden" | "Discord account required"
    details?: string
}

/**
 * Permission lookup threw. Distinct from missing roles: callers must retry, not treat this as
 * Forbidden.
 */
export function mapPermissionResolutionUnavailable(): PermissionGuardUnavailable {
    return {
        ok: false,
        status: 503,
        error: "Service Unavailable",
        details:
            "Permission resolution is temporarily unavailable. Please retry in a moment or re-open the dashboard.",
    }
}

/**
 * The caller is authenticated and in the guild but lacks the required web permission.
 * Distinct from a resolution outage (503).
 */
export function mapMissingRequiredPermissions(): PermissionGuardForbidden {
    return {
        ok: false,
        status: 403,
        error: "Forbidden",
        details:
            "You do not have permission for this action in this server (your Discord role may not include the required abilities).",
    }
}

export type DiscordAccountRequiredKind = "resolve_failed" | "missing"

/**
 * Discord snowflake could not be resolved for a signed-in session.
 * Stays 403 (not 401 sign-in, not 503 retry): the session exists but has no Discord user id.
 * Thrown lookup vs a null id share the status/error; only the missing-id path includes details.
 */
export function mapDiscordAccountRequiredFailure(
    kind: DiscordAccountRequiredKind
): PermissionGuardForbidden {
    if (kind === "missing") {
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
            details:
                "We could not resolve your Discord user id (needed for roles and voice state). Sign in with Discord, or sign out and sign in again.",
        }
    }
    return {
        ok: false,
        status: 403,
        error: "Discord account required",
    }
}
