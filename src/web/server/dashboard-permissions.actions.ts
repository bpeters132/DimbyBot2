"use server"

import type { GuildDashboardSnapshotResult } from "@/types/web"
import { headers } from "next/headers"
import { getGuildDashboardPermissionSnapshot } from "@/lib/api-auth"

const DISCORD_SNOWFLAKE_RE = /^\d{17,22}$/

/** Loads primary + OAuth-fallback web permission lists for dashboard UI gating. */
export async function getGuildDashboardSnapshotAction(
    guildId: string
): Promise<GuildDashboardSnapshotResult> {
    const trimmed = guildId?.trim() ?? ""
    if (!trimmed || !DISCORD_SNOWFLAKE_RE.test(trimmed)) {
        return {
            ok: false,
            status: 400,
            error: "Invalid guild id",
            details: "Expected a non-empty Discord snowflake (numeric id).",
        }
    }
    return getGuildDashboardPermissionSnapshot(await headers(), trimmed)
}
