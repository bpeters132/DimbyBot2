import type { Track } from "lavalink-client"
import { resolveWebRequesterDiscordId } from "../resolveWebRequesterId.js"
import { resolveWebDashboardTextChannelId } from "../webDashboardTextChannel.js"
import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse, QueueResponse } from "../../web/types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import { toQueueResponse } from "../../web/lib/player-state.js"
import { ensurePlayerConnected } from "../../util/musicManager.js"

function parseNumber(value: string | null, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

export async function queueGET(
    headers: Headers,
    guildId: string,
    searchParams: URLSearchParams
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.VIEW_PLAYER])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const page = parseNumber(searchParams.get("page"), 1)
    const limit = parseNumber(searchParams.get("limit"), 20)
    const player = getBotClient().lavalink.getPlayer(guildId)
    return {
        status: 200,
        body: {
            ok: true,
            data: toQueueResponse(guildId, player ?? null, page, limit),
        },
    }
}

export async function queuePOST(
    headers: Headers,
    guildId: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.MANAGE_QUEUE])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const requester = resolveWebRequesterDiscordId(rawBody, guard.discordUserId)
    if (requester.ok === false) {
        return {
            status: requester.status,
            body: {
                ok: false,
                error: { error: requester.error, details: requester.details },
            },
        }
    }

    const body = (typeof rawBody === "object" && rawBody !== null ? rawBody : {}) as {
        query?: unknown
    }
    const query = typeof body.query === "string" ? body.query.trim() : ""
    if (!query) {
        return {
            status: 400,
            body: { ok: false, error: { error: "Query is required." } },
        }
    }

    const client = getBotClient()
    const guild = client.guilds.cache.get(guildId)
    if (!guild) {
        return {
            status: 404,
            body: { ok: false, error: { error: "Guild not found in bot cache." } },
        }
    }

    const member = await guild.members.fetch(requester.requesterId).catch(() => null)
    const voiceChannel = member?.voice?.channel
    if (!voiceChannel) {
        return {
            status: 400,
            body: { ok: false, error: { error: "Join a voice channel first." } },
        }
    }

    const textChannelId = await resolveWebDashboardTextChannelId(guild)

    let player = client.lavalink.getPlayer(guildId)
    if (!player) {
        player = await client.lavalink.createPlayer({
            guildId,
            voiceChannelId: voiceChannel.id,
            textChannelId,
            selfDeaf: true,
            volume: 100,
        })
    }

    try {
        await ensurePlayerConnected(client, player, voiceChannel)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Voice connection failed."
        return {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Could not connect the player to your voice channel.",
                    details: message,
                },
            },
        }
    }

    const searchResult = await player.search(query, {
        requester: { id: requester.requesterId, username: guard.session.user.name || "web-user" },
    })
    if (!searchResult.tracks.length) {
        return {
            status: 404,
            body: { ok: false, error: { error: "No matches found." } },
        }
    }

    if (searchResult.loadType === "playlist") {
        player.queue.add(searchResult.tracks as Track[])
    } else {
        player.queue.add(searchResult.tracks[0] as Track)
    }

    if (!player.playing && player.queue.tracks.length > 0) {
        await player.play()
    }

    return {
        status: 200,
        body: {
            ok: true,
            data: toQueueResponse(guildId, player),
        },
    }
}

export async function queueDELETE(
    headers: Headers,
    guildId: string
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.MANAGE_QUEUE])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const player = getBotClient().lavalink.getPlayer(guildId)
    if (player) {
        player.queue.splice(0, player.queue.tracks.length)
    }

    return {
        status: 200,
        body: {
            ok: true,
            data: toQueueResponse(guildId, player ?? null),
        },
    }
}
