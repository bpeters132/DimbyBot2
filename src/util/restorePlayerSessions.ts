import type { VoiceBasedChannel } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import type { PlayerSessionData } from "../types/index.js"
import { deletePlayerSession, listPlayerSessions } from "../repositories/playerSessionRepository.js"
import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import { playerBroadcaster } from "../shared/websocket/PlayerBroadcaster.js"
import { getGuildSettings } from "./saveControlChannel.js"
import { ensurePlayerConnected, startPlaybackIfNeeded } from "./musicManager.js"
import {
    clearPlayerSessionRestoreInProgress,
    markPlayerSessionRestoreInProgress,
    schedulePlayerSessionSave,
} from "./playerSessionPersistence.js"
import { resolvePersistedTracks } from "./playerSessionTracks.js"
import { countHumanMembers } from "./voiceChannelMembers.js"

let discordReady = false
let restoreAttempted = false

/** Called from `clientReady` so restore waits for Discord before touching guild channels. */
export function markDiscordReadyForPlayerRestore(): void {
    discordReady = true
}

/** Attempts one-shot restore after Lavalink node connect (no-op if Discord is not ready yet). */
export async function tryRestorePlayerSessionsOnLavalinkConnect(client: BotClient): Promise<void> {
    if (!discordReady || restoreAttempted) return
    const listed = await restorePlayerSessions(client)
    if (listed) restoreAttempted = true
}

async function fetchVoiceChannel(
    client: BotClient,
    guildId: string,
    voiceChannelId: string
): Promise<VoiceBasedChannel | null> {
    const guild =
        client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null))
    if (!guild) return null

    const cached = guild.channels.cache.get(voiceChannelId)
    if (cached?.isVoiceBased()) return cached

    const fetched = await guild.channels.fetch(voiceChannelId).catch(() => null)
    if (fetched?.isVoiceBased()) return fetched
    return null
}

function resolveTextChannelId(session: PlayerSessionData): string | null {
    if (session.textChannelId) return session.textChannelId
    const settings = getGuildSettings()[session.guildId]
    return settings?.controlChannelId ?? null
}

async function restoreSingleSession(client: BotClient, session: PlayerSessionData): Promise<void> {
    const { guildId, voiceChannelId, snapshot } = session

    if (client.lavalink.getPlayer(guildId)) {
        client.debug(`[playerSession] restore skipped for ${guildId}: player already exists`)
        return
    }

    const voiceChannel = await fetchVoiceChannel(client, guildId, voiceChannelId)
    if (!voiceChannel) {
        client.info(
            `[playerSession] stale session removed for ${guildId}: voice channel ${voiceChannelId} not found`
        )
        await deletePlayerSession(guildId)
        return
    }

    const humans = countHumanMembers(voiceChannel)
    if (humans === 0) {
        client.info(
            `[playerSession] stale session removed for ${guildId}: no humans in VC ${voiceChannelId}`
        )
        await deletePlayerSession(guildId)
        return
    }

    const tracksToRestore = [...(snapshot.current ? [snapshot.current] : []), ...snapshot.queue]
    if (tracksToRestore.length === 0) {
        await deletePlayerSession(guildId)
        return
    }

    const textChannelId = resolveTextChannelId(session)
    markPlayerSessionRestoreInProgress(guildId)

    try {
        const player = await client.lavalink.createPlayer({
            guildId,
            voiceChannelId,
            textChannelId: textChannelId ?? undefined,
            selfDeaf: true,
            volume: snapshot.volume,
        })

        await ensurePlayerConnected(client, player, voiceChannel)

        const { resolved, failed } = await resolvePersistedTracks(player, tracksToRestore)
        if (failed > 0) {
            client.warn(
                `[playerSession] restore for ${guildId}: ${failed}/${tracksToRestore.length} tracks failed to resolve`
            )
        }
        if (resolved.length === 0) {
            client.warn(
                `[playerSession] restore for ${guildId}: no tracks resolved; destroying player`
            )
            await player.destroy()
            await deletePlayerSession(guildId)
            return
        }

        await player.queue.add(resolved)

        if (snapshot.repeatMode !== "off") {
            await player.setRepeatMode(snapshot.repeatMode)
        }
        player.set("autoplay", snapshot.autoplay)
        player.set("rrqEnabled", snapshot.rrqEnabled)

        await startPlaybackIfNeeded(player)
        if (snapshot.paused && player.playing) {
            await player.pause()
        }

        client.info(
            `[playerSession] restored player for guild ${guildId} (${resolved.length} tracks, humans=${humans})`
        )

        scheduleControlMessageUpdate(client, guildId)
        playerBroadcaster.broadcastPlayerEvent(guildId, player, "queueUpdate")
        schedulePlayerSessionSave(player)
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        client.error(`[playerSession] restore failed for guild ${guildId}: ${msg}`)
        const orphan = client.lavalink.getPlayer(guildId)
        if (orphan) {
            await orphan.destroy().catch(() => undefined)
        }
        // Transient failures (Lavalink/Discord blips) must not wipe the persisted snapshot.
    } finally {
        clearPlayerSessionRestoreInProgress(guildId)
    }
}

function scheduleControlMessageUpdate(client: BotClient, guildId: string): void {
    void updateControlMessage(client, guildId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        client.error(`[playerSession] updateControlMessage failed for ${guildId}: ${msg}`)
    })
}

/** Loads all persisted sessions and restores players when humans remain in the saved VC. */
export async function restorePlayerSessions(client: BotClient): Promise<boolean> {
    let sessions: PlayerSessionData[]
    try {
        sessions = await listPlayerSessions()
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        client.error(`[playerSession] failed to list sessions: ${msg}`)
        return false
    }

    if (sessions.length === 0) {
        client.debug("[playerSession] no persisted sessions to restore")
        return true
    }

    client.info(`[playerSession] attempting restore for ${sessions.length} persisted session(s)`)
    for (const session of sessions) {
        await restoreSingleSession(client, session)
    }
    return true
}
