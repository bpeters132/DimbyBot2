/**
 * Pure owner-gate decision for dashboard admin routes (no Next.js / Better Auth imports).
 * Maps session + Discord snowflake + `OWNER_ID` into the same status/error shape as
 * {@link resolveAdminAccess} in `src/web/lib/admin-access.ts`.
 */
export type AdminAccessDecision =
    | { ok: true; discordUserId: string }
    | { ok: false; status: number; error: string; details?: string }

export type AdminAccessDecisionInput = {
    /** Session lookup threw (treat as service unavailable). */
    sessionLoadFailed?: boolean
    /** Better Auth session has a user id. */
    hasSessionUser: boolean
    /** Discord account resolution threw. */
    discordResolveFailed?: boolean
    /** Resolved Discord snowflake, or null when missing. */
    discordUserId: string | null
    /** Cached `OWNER_ID` (bot developer). */
    ownerId: string | null | undefined
}

/** Decides whether the caller may use developer admin surfaces. */
export function decideAdminAccess(input: AdminAccessDecisionInput): AdminAccessDecision {
    if (input.sessionLoadFailed) {
        return {
            ok: false,
            status: 503,
            error: "Service Unavailable",
            details: "Could not load your session. Please try again later.",
        }
    }
    if (!input.hasSessionUser) {
        return { ok: false, status: 401, error: "Unauthorized" }
    }
    if (input.discordResolveFailed) {
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
            details: "Sign in with Discord, or sign out and sign in again.",
        }
    }
    if (!input.discordUserId) {
        return {
            ok: false,
            status: 403,
            error: "Discord account required",
            details:
                "We could not resolve your Discord user id. Sign in with Discord, or sign out and sign in again.",
        }
    }
    const ownerId = input.ownerId
    if (!ownerId || input.discordUserId !== ownerId) {
        return {
            ok: false,
            status: 403,
            error: "Forbidden",
            details: "Developer access required.",
        }
    }
    return { ok: true, discordUserId: input.discordUserId }
}
