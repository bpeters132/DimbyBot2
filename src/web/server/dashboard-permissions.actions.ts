"use server"

import type { GuildDashboardSnapshotResult } from "@/types/web"
import { headers } from "next/headers"
import { sanitizeErrorText } from "@/lib/sanitize-log-text"
import { getGuildDashboardPermissionSnapshot } from "@/lib/api-auth"
import { mapGuildDashboardSnapshotActionFailure } from "@/lib/dashboard-permission-snapshot-action"
import { parseDashboardGuildId } from "@/shared/discord-user-id"

/** Loads primary + OAuth-fallback web permission lists for dashboard UI gating. */
export async function getGuildDashboardSnapshotAction(
    guildId: string
): Promise<GuildDashboardSnapshotResult> {
    const trimmed = parseDashboardGuildId(guildId)
    if (!trimmed) {
        return mapGuildDashboardSnapshotActionFailure("invalid_guild")
    }
    try {
        return await getGuildDashboardPermissionSnapshot(await headers(), trimmed)
    } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e)
        const msg = sanitizeErrorText(raw, 800)
        console.error(
            "[dashboard-permissions.actions] getGuildDashboardPermissionSnapshot failed:",
            msg
        )
        return mapGuildDashboardSnapshotActionFailure("snapshot_throw")
    }
}
