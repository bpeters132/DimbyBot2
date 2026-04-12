import { resolveWebRequesterDiscordId } from "../resolveWebRequesterId.js"
import { resolveWebDashboardTextChannelId } from "../webDashboardTextChannel.js"
import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse } from "../../types/apiPayloads.js"
import type { PlayerStateResponse } from "../../types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import { toPlayerStateResponse } from "../../web/lib/player-state.js"
import { ensurePlayerConnected, startPlaybackIfNeeded } from "../../util/musicManager.js"
import { stampRequesterUserIdOnTracks } from "../../util/rrqDisconnect.js"

export async function playerPlayPOST(
    headers: Headers,
    guildId: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<PlayerStateResponse> }> {
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

    try {
        const client = getBotClient()
        const guild = client.guilds.cache.get(guildId)
        if (!guild) {
            return {
                status: 404,
                body: { ok: false, error: { error: "Guild not found in bot cache." } },
            }
        }

        const member = await guild.members.fetch(requester.requesterId).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            console.error("[playerPlayPOST] Failed to fetch requester member", {
                requesterId: requester.requesterId,
                message,
            })
            return null
        })
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
            requester: {
                id: requester.requesterId,
                username: guard.session.user.name || "web-user",
            },
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

        if (player.queue.tracks.length > 0) {
            await startPlaybackIfNeeded(player)
        }

        return {
            status: 200,
            body: {
                ok: true,
                data: await toPlayerStateResponse(guildId, requester.requesterId, player),
            },
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[playerPlayPOST] unhandled error", { guildId, message })
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Internal server error.", details: message },
            },
        }
    }
}
