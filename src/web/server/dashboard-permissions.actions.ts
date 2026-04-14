"use server"

import type { GuildDashboardSnapshotResult } from "@/types/web"
import { headers } from "next/headers"
import { sanitizeErrorText } from "@/lib/sanitize-log-text"
import { getGuildDashboardPermissionSnapshot } from "@/lib/api-auth"

const DISCORD_SNOWFLAKE_RE = /^\d{17,22}$/

/** Loads primary + OAuth-fallback web permission lists for dashboard UI gating. */
export async function getGuildDashboardSnapshotAction(
    guildId: string
): Promise<GuildDashboardSnapshotResult> {
    const trimmed = typeof guildId === "string" ? guildId.trim() : ""
    if (!trimmed || !DISCORD_SNOWFLAKE_RE.test(trimmed)) {
        return {
            ok: false,
            status: 400,
            error: "Invalid guild id",
            details: "Expected a non-empty Discord snowflake (numeric id).",
        }
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
        return {
            ok: false,
            status: 503,
            error: "Service unavailable",
            details: "Could not load permission snapshot. Try again later.",
        }
    }
}
