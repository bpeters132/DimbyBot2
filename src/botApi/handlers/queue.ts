import { PermissionFlagsBits } from "discord.js"
import { resolveWebRequesterDiscordId } from "../resolveWebRequesterId.js"
import { resolveWebDashboardTextChannelId } from "../webDashboardTextChannel.js"
import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse } from "../../types/apiPayloads.js"
import type { QueueResponse } from "../../types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import { toQueueResponse } from "../../web/lib/player-state.js"
import { ensurePlayerConnected, startPlaybackIfNeeded } from "../../util/musicManager.js"
import { stampRequesterUserIdOnTracks } from "../../util/rrqDisconnect.js"

const MAX_QUEUE_PAGE_LIMIT = 100

function clampInt(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** Parses a query integer, truncates toward zero, and clamps to inclusive bounds. */
function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return clampInt(Math.trunc(parsed), min, max)
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

    const page = parseNumber(searchParams.get("page"), 1, 1, 10_000)
    const limit = parseNumber(searchParams.get("limit"), 20, 1, MAX_QUEUE_PAGE_LIMIT)
    const player = getBotClient().lavalink.getPlayer(guildId)
    return {
        status: 200,
        body: {
            ok: true,
            data: await toQueueResponse(guildId, player ?? null, page, limit),
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

    const botUser = client.user
    if (botUser) {
        const joinPerms = voiceChannel.permissionsFor(botUser)
        if (!joinPerms) {
            return {
                status: 403,
                body: {
                    ok: false,
                    error: {
                        error: "Could not determine bot permissions for this voice channel.",
                    },
                },
            }
        }
        if (
            !joinPerms.has(PermissionFlagsBits.Connect) ||
            !joinPerms.has(PermissionFlagsBits.Speak)
        ) {
            return {
                status: 403,
                body: {
                    ok: false,
                    error: { error: "Bot lacks permission to join this voice channel." },
                },
            }
        }
    }

    let player = client.lavalink.getPlayer(guildId)
    let createdHere = false
    if (!player) {
        player = await client.lavalink.createPlayer({
            guildId,
            voiceChannelId: voiceChannel.id,
            textChannelId,
            selfDeaf: true,
            volume: 100,
        })
        createdHere = true
    }

    const cleanupCreatedPlayer = async (): Promise<void> => {
        if (!createdHere) return
        await client.lavalink.destroyPlayer(guildId).catch(() => undefined)
    }

    try {
        await ensurePlayerConnected(client, player, voiceChannel)
        const refreshedMember = await guild.members.fetch(requester.requesterId).catch(() => null)
        const refreshedVoiceChannel = refreshedMember?.voice?.channel
        if (!refreshedVoiceChannel || refreshedVoiceChannel.id !== voiceChannel.id) {
            await cleanupCreatedPlayer()
            return {
                status: 400,
                body: { ok: false, error: { error: "Join a voice channel first." } },
            }
        }
    } catch (err: unknown) {
        await cleanupCreatedPlayer()
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
        stampRequesterUserIdOnTracks(searchResult.tracks, requester.requesterId)
        player.queue.add(searchResult.tracks)
    } else {
        stampRequesterUserIdOnTracks([searchResult.tracks[0]], requester.requesterId)
        player.queue.add(searchResult.tracks[0])
    }

    await startPlaybackIfNeeded(player)

    return {
        status: 200,
        body: {
            ok: true,
            data: await toQueueResponse(guildId, player),
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
    try {
        if (player) {
            await player.queue.splice(0, player.queue.tracks.length)
        }
        return {
            status: 200,
            body: {
                ok: true,
                data: await toQueueResponse(guildId, player ?? null),
            },
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const details = err instanceof Error ? (err.stack ?? err.message) : String(err)
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: message, details },
            },
        }
    }
}
