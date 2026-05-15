import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import { requireDeveloperAccess } from "../../../shared/api-auth.js"
import { getBotClient } from "../../../lib/botClientRegistry.js"
import type { ApiResponse } from "../../../types/index.js"
import type {
    AdminGuildSummary,
    AdminMetricsResponse,
    AdminMetricsPlayerSummary,
} from "../../../types/web.js"

export type {
    AdminGuildSummary,
    AdminMetricsPlayerSummary,
    AdminMetricsResponse,
} from "../../../types/web.js"

function playerStatus(player: Player): "playing" | "paused" | "idle" {
    if (player.playing) return "playing"
    if (player.paused) return "paused"
    return "idle"
}

function currentTrackSummary(
    track: Track | UnresolvedTrack | null | undefined
): AdminMetricsPlayerSummary["currentTrack"] {
    if (!track?.info) return null
    const info = track.info
    const title =
        typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Unknown"
    const author =
        typeof info.author === "string" && info.author.trim() ? info.author.trim() : undefined
    const uri = typeof info.uri === "string" && info.uri.trim() ? info.uri.trim() : undefined
    return { title, author, uri }
}

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
