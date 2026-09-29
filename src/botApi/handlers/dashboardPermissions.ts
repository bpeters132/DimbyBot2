import { getBotClient } from "../../lib/botClientRegistry.js"
import type { GuildDashboardSnapshotResult } from "../../types/web.js"
import {
    finishGuildDashboardPermissionSnapshot,
    resolveAuthenticatedGuildAccess,
} from "../../shared/api-auth.js"
import {
    mapDashboardPermissionsAccessDenied,
    mapDashboardPermissionsBotNotReady,
} from "../dashboardPermissionsFailure.js"

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
        return mapDashboardPermissionsAccessDenied(ctx)
    }

    let botClient
    try {
        botClient = getBotClient()
    } catch {
        return mapDashboardPermissionsBotNotReady()
    }

    const body = await finishGuildDashboardPermissionSnapshot(ctx, botClient, guildId)
    return { status: body.ok === true ? 200 : body.status, body }
}
