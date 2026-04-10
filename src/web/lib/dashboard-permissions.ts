import type { GuildDashboardPermissionSnapshot } from "@/types/web"
import type { WebPermissionKey } from "@/lib/web-permission-keys"

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
    return false
}

/** True if every listed permission is satisfied (AND). */
export function dashboardHasAllWebPermissions(
    snapshot: GuildDashboardPermissionSnapshot,
    perms: WebPermissionKey[]
): boolean {
    return perms.every((p) => dashboardHasWebPermission(snapshot, p))
}
