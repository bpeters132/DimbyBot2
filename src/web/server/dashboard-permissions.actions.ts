"use server"

import type { GuildDashboardSnapshotResult } from "@/types/web"
import { headers } from "next/headers"
import { getGuildDashboardPermissionSnapshot } from "@/lib/api-auth"

/** Loads primary + OAuth-fallback web permission lists for dashboard UI gating. */
export async function getGuildDashboardSnapshotAction(
    guildId: string
): Promise<GuildDashboardSnapshotResult> {
    return getGuildDashboardPermissionSnapshot(await headers(), guildId)
}
