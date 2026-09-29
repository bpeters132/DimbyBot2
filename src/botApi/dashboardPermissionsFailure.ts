import type { GuildDashboardSnapshotResult } from "../types/web.js"

export type DashboardPermissionsAccessDenied = {
    status: number
    error: string
    details?: string
}

type DashboardPermissionsFailure = Extract<GuildDashboardSnapshotResult, { ok: false }>

/**
 * Maps guild-access denial onto the dashboard snapshot envelope.
 * Keep the access HTTP status (401/403/503) — do not rewrite it as bot-not-ready.
 */
export function mapDashboardPermissionsAccessDenied(denied: DashboardPermissionsAccessDenied): {
    status: number
    body: DashboardPermissionsFailure
} {
    return {
        status: denied.status,
        body: {
            ok: false,
            status: denied.status,
            error: denied.error,
            details: denied.details,
        },
    }
}

/**
 * Bot process is not registered yet. Distinct from access denial: callers must retry, not
 * treat this as an auth/permission failure.
 */
export function mapDashboardPermissionsBotNotReady(): {
    status: 503
    body: DashboardPermissionsFailure
} {
    return {
        status: 503,
        body: {
            ok: false,
            status: 503,
            error: "Bot not ready",
            details: "The Discord bot is still starting; try again in a few seconds.",
        },
    }
}
