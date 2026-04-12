import type { GuildDashboardPermissionSnapshot } from "@/types/web"
import type { WebPermissionKey } from "@/lib/web-permission-keys"
import { webPlayerTrace } from "@/lib/web-player-debug-log"

/**
 * Human-readable reason for {@link dashboardHasWebPermission} (for troubleshooting).
 */
export function explainDashboardWebPermission(
    snapshot: GuildDashboardPermissionSnapshot,
    perm: WebPermissionKey
): string {
    if (snapshot.primaryPermissions.includes(perm)) {
        return "allow:primaryPermissions"
    }
    if (!snapshot.memberResolved && snapshot.oauthPermissions.includes(perm)) {
        return "allow:oauthPermissions (member not resolved by bot)"
    }
    if (snapshot.memberResolved) {
        return `deny:memberResolved=true but primaryPermissions lacks "${perm}" (OAuth fallback is not used when the bot resolved a member)`
    }
    return `deny:neither primary nor oauth lists include "${perm}"`
}

/**
 * Whether the user may perform an action that the bot API would allow, using the same primary vs
 * OAuth-fallback merge as {@link requirePermissions}.
 */
export function dashboardHasWebPermission(
    snapshot: GuildDashboardPermissionSnapshot,
    perm: WebPermissionKey
): boolean {
    if (snapshot.primaryPermissions.includes(perm)) {
        return true
    }
    if (!snapshot.memberResolved && snapshot.oauthPermissions.includes(perm)) {
        return true
    }
    webPlayerTrace("dashboardHasWebPermission: denied", {
        perm,
        memberResolved: snapshot.memberResolved,
        primary: snapshot.primaryPermissions,
        oauth: snapshot.oauthPermissions,
        reason: explainDashboardWebPermission(snapshot, perm),
    })
    return false
}

/** True if every listed permission is satisfied (AND). */
export function dashboardHasAllWebPermissions(
    snapshot: GuildDashboardPermissionSnapshot,
    perms: WebPermissionKey[]
): boolean {
    return perms.every((p) => dashboardHasWebPermission(snapshot, p))
}
