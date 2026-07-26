import type { GuildDashboardPermissionSnapshot } from "@/types/web"
import type { WebPermissionKey } from "@/lib/web-permission-keys"
import { webPlayerTrace } from "@/lib/web-player-debug-log"
import {
    dashboardHasAllWebPermissions as sharedDashboardHasAllWebPermissions,
    dashboardHasWebPermission as sharedDashboardHasWebPermission,
    explainDashboardWebPermission as sharedExplainDashboardWebPermission,
    resolveWebPermissionDecision,
} from "@/shared/dashboard-web-permission"

/**
 * Human-readable reason for {@link dashboardHasWebPermission} (for troubleshooting).
 */
export function explainDashboardWebPermission(
    snapshot: GuildDashboardPermissionSnapshot,
    perm: WebPermissionKey
): string {
    return sharedExplainDashboardWebPermission(snapshot, perm)
}

/**
 * Whether the user may perform an action that the bot API would allow, using the same primary vs
 * OAuth-fallback merge as {@link requirePermissions}.
 */
export function dashboardHasWebPermission(
    snapshot: GuildDashboardPermissionSnapshot,
    perm: WebPermissionKey
): boolean {
    const decision = resolveWebPermissionDecision(snapshot, perm)
    if (decision.allowed) {
        return true
    }
    webPlayerTrace("dashboardHasWebPermission: denied", {
        perm,
        memberResolved: snapshot.memberResolved,
        primary: snapshot.primaryPermissions,
        oauth: snapshot.oauthPermissions,
        reason: decision.reason,
    })
    return false
}

/** True if every listed permission is satisfied (AND). */
export function dashboardHasAllWebPermissions(
    snapshot: GuildDashboardPermissionSnapshot,
    perms: WebPermissionKey[]
): boolean {
    const allowed = sharedDashboardHasAllWebPermissions(snapshot, perms)
    if (!allowed) {
        const denied = perms.filter((perm) => !sharedDashboardHasWebPermission(snapshot, perm))
        webPlayerTrace("dashboardHasAllWebPermissions: denied", {
            denied,
            memberResolved: snapshot.memberResolved,
            primary: snapshot.primaryPermissions,
            oauth: snapshot.oauthPermissions,
        })
    }
    return allowed
}
