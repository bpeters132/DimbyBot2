import { requireDeveloperAccess } from "../../../shared/api-auth.js"
import { getBotClient } from "../../../lib/botClientRegistry.js"
import type { ApiResponse } from "../../../types/index.js"
import type {
    AdminGuildSummary,
    AdminMetricsResponse,
    AdminMetricsPlayerSummary,
} from "../../../types/web.js"
import { currentTrackSummary, playerStatus } from "../../adminMetricsSummary.js"

export type {
    AdminGuildSummary,
    AdminMetricsPlayerSummary,
    AdminMetricsResponse,
} from "../../../types/web.js"

export async function adminMetricsGET(
    headers: Headers
): Promise<{ status: number; body: ApiResponse<AdminMetricsResponse> }> {
    const guard = await requireDeveloperAccess(headers)
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const client = getBotClient()
    const players = client.lavalink.players
    const summaries: AdminMetricsPlayerSummary[] = []

    const guilds: AdminGuildSummary[] = []
    for (const guild of client.guilds.cache.values()) {
        const mc = guild.memberCount
        guilds.push({
            guildId: guild.id,
            guildName: guild.name,
            memberCount: typeof mc === "number" && Number.isFinite(mc) ? mc : null,
        })
    }
    guilds.sort((a, b) =>
        a.guildName.localeCompare(b.guildName, undefined, { sensitivity: "base" })
    )

    for (const player of players.values()) {
        const guild = client.guilds.cache.get(player.guildId)
        summaries.push({
            guildId: player.guildId,
            guildName: guild?.name ?? null,
            status: playerStatus(player),
            queueSize: player.queue?.tracks?.length ?? 0,
            currentTrack: currentTrackSummary(player.queue?.current),
        })
    }

    const nodeManager = client.lavalink.nodeManager as { nodes?: { size?: number } }
    const nodeCount = typeof nodeManager.nodes?.size === "number" ? nodeManager.nodes.size : 0

    return {
        status: 200,
        body: {
            ok: true,
            data: {
                guildCount: guilds.length,
                activePlayers: players.size,
                nodeCount,
                guilds,
                players: summaries,
            },
        },
    }
}
