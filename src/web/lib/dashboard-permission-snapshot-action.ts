import type { GuildDashboardSnapshotResult } from "@/types/web"

export type GuildDashboardSnapshotActionFailureKind = "invalid_guild" | "snapshot_throw"

type SnapshotActionFailure = Extract<GuildDashboardSnapshotResult, { ok: false }>

/**
 * Maps `getGuildDashboardSnapshotAction` local failures before / around the snapshot load.
 * A bad guild id is 400; an unexpected throw is 503 "Service unavailable" — not the Bot API
 * origin/unreachable 503s and not "Permission check unavailable".
 */
export function mapGuildDashboardSnapshotActionFailure(
    kind: GuildDashboardSnapshotActionFailureKind
): SnapshotActionFailure {
    if (kind === "invalid_guild") {
        return {
            ok: false,
            status: 400,
            error: "Invalid guild id",
            details: "Expected a non-empty Discord snowflake (numeric id).",
        }
    }
    return {
        ok: false,
        status: 503,
        error: "Service unavailable",
        details: "Could not load permission snapshot. Try again later.",
    }
}
