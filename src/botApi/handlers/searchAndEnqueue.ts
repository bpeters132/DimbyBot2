import { PermissionFlagsBits } from "discord.js"
import type { Player } from "lavalink-client"
import type BotClient from "../../lib/BotClient.js"
import type { ApiErrorPayload } from "../../types/apiPayloads.js"
import { ensurePlayerConnected, startPlaybackIfNeeded } from "../../util/musicManager.js"
import { stampRequesterUserIdOnTracks } from "../../util/rrqDisconnect.js"
import type { PermissionGuardSuccess } from "../../web/lib/api-auth.js"
import { resolveWebDashboardTextChannelId } from "../webDashboardTextChannel.js"

export type SearchAndEnqueueGuard = Pick<PermissionGuardSuccess, "session">

export type SearchAndEnqueueFailure = {
    ok: false
    status: number
    error: ApiErrorPayload
}

export type SearchAndEnqueueSuccess = { ok: true; player: Player }

export type SearchAndEnqueueResult = SearchAndEnqueueSuccess | SearchAndEnqueueFailure

/**
 * Shared path for web-driven search → enqueue: resolves guild/member/voice, checks bot voice
 * permissions, (re)creates the Lavalink player, connects, searches, stamps requester ids, and
 * starts playback when needed.
 */
export async function searchAndEnqueue(
    client: BotClient,
    guildId: string,
    requesterId: string,
    query: string,
    guard: SearchAndEnqueueGuard
): Promise<SearchAndEnqueueResult> {
    const guild = client.guilds.cache.get(guildId)
    if (!guild) {
        return {
            ok: false,
            status: 404,
            error: { error: "Guild not found in bot cache." },
        }
    }

    const member = await guild.members.fetch(requesterId).catch(() => null)
    const voiceChannel = member?.voice?.channel
    if (!voiceChannel) {
        return {
            ok: false,
            status: 400,
            error: { error: "Join a voice channel first." },
        }
    }

    const textChannelId = await resolveWebDashboardTextChannelId(guild)

    const botUser = client.user
    if (!botUser) {
        return {
            ok: false,
            status: 503,
            error: { error: "Bot not ready; cannot verify voice permissions." },
        }
    }
    const joinPerms = voiceChannel.permissionsFor(botUser)
    if (!joinPerms) {
        return {
            ok: false,
            status: 403,
            error: { error: "Could not determine bot permissions for this voice channel." },
        }
    }
    if (!joinPerms.has(PermissionFlagsBits.Connect) || !joinPerms.has(PermissionFlagsBits.Speak)) {
        return {
            ok: false,
            status: 403,
            error: { error: "Bot lacks permission to join this voice channel." },
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
        const refreshedMember = await guild.members.fetch(requesterId).catch(() => null)
        const refreshedVoiceChannel = refreshedMember?.voice?.channel
        if (!refreshedVoiceChannel || refreshedVoiceChannel.id !== voiceChannel.id) {
            await cleanupCreatedPlayer()
            return {
                ok: false,
                status: 400,
                error: { error: "Join a voice channel first." },
            }
        }
    } catch (err: unknown) {
        await cleanupCreatedPlayer()
        const message = err instanceof Error ? err.message : "Voice connection failed."
        return {
            ok: false,
            status: 503,
            error: {
                error: "Could not connect the player to your voice channel.",
                details: message,
            },
        }
    }

    const requesterName =
        member?.user.globalName ?? member?.user.username ?? guard.session.user?.name ?? "web-user"
    const searchResult = await player.search(query, {
        requester: {
            id: requesterId,
            username: requesterName,
        },
    })
    if (!searchResult.tracks.length) {
        return {
            ok: false,
            status: 404,
            error: { error: "No matches found." },
        }
    }

    if (searchResult.loadType === "playlist") {
        stampRequesterUserIdOnTracks(searchResult.tracks, requesterId)
        player.queue.add(searchResult.tracks)
    } else {
        stampRequesterUserIdOnTracks([searchResult.tracks[0]], requesterId)
        player.queue.add(searchResult.tracks[0])
    }

    await startPlaybackIfNeeded(player)

    return { ok: true, player }
}
