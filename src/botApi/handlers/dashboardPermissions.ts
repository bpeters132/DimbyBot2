import { getBotClient } from "../../lib/botClientRegistry.js"
import type { GuildDashboardSnapshotResult } from "../../types/web.js"
import {
    finishGuildDashboardPermissionSnapshot,
    resolveAuthenticatedGuildAccess,
} from "../../shared/api-auth.js"

/**
 * Resolves dashboard permission lists using the in-process Discord bot (same logic as the Next
 * server when it has a registered {@link BotClient}).
 */
export async function dashboardPermissionsGET(
    headers: Headers,
    guildId: string
): Promise<{ status: number; body: GuildDashboardSnapshotResult }> {
    const ctx = await resolveAuthenticatedGuildAccess(headers, guildId)
    if (ctx.ok === false) {
        return {
            status: ctx.status,
            body: {
                ok: false,
                status: ctx.status,
                error: ctx.error,
                details: ctx.details,
            },
        }
    }

    let botClient
    try {
        botClient = getBotClient()
    } catch {
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

    const body = await finishGuildDashboardPermissionSnapshot(ctx, botClient, guildId)
    return { status: body.ok === true ? 200 : body.status, body }
}
