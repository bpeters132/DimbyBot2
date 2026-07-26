import type { GuildDashboardPermissionSnapshot } from "../types/web.js"

type WebPermissionDecision =
    | { allowed: true; reason: string; memberResolved: boolean }
    | { allowed: false; reason: string; memberResolved: boolean }

/**
 * Shared primary vs OAuth-fallback rules for dashboard gating (matches {@link requirePermissions}).
 * Pure helper — callers may add tracing around denials.
 */
export function resolveWebPermissionDecision(
    snapshot: GuildDashboardPermissionSnapshot,
    perm: string
): WebPermissionDecision {
    if (snapshot.primaryPermissions.includes(perm)) {
        return {
            allowed: true,
            reason: "allow:primaryPermissions",
            memberResolved: snapshot.memberResolved,
        }
    }
    if (!snapshot.memberResolved && snapshot.oauthPermissions.includes(perm)) {
        return {
            allowed: true,
            reason: "allow:oauthPermissions (member not resolved by bot)",
            memberResolved: snapshot.memberResolved,
        }
    }
    if (snapshot.memberResolved) {
        return {
            allowed: false,
            reason: `deny:memberResolved=true but primaryPermissions lacks "${perm}" (OAuth fallback is not used when the bot resolved a member)`,
            memberResolved: true,
        }
    }
    return {
        allowed: false,
        reason: `deny:neither primary nor oauth lists include "${perm}"`,
        memberResolved: false,
    }
}

/** Human-readable reason for {@link dashboardHasWebPermission} (for troubleshooting). */
export function explainDashboardWebPermission(
    snapshot: GuildDashboardPermissionSnapshot,
    perm: string
): string {
    return resolveWebPermissionDecision(snapshot, perm).reason
}

/**
 * Whether the user may perform an action that the bot API would allow, using the same primary vs
 * OAuth-fallback merge as {@link requirePermissions}.
 */
export function dashboardHasWebPermission(
    snapshot: GuildDashboardPermissionSnapshot,
    perm: string
): boolean {
    return resolveWebPermissionDecision(snapshot, perm).allowed
}

/** True if every listed permission is satisfied (AND). */
export function dashboardHasAllWebPermissions(
    snapshot: GuildDashboardPermissionSnapshot,
    perms: string[]
): boolean {
    return perms.every((perm) => dashboardHasWebPermission(snapshot, perm))
}
