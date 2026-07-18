import type { VoiceBasedChannel } from "discord.js"
import type BotClient from "../lib/BotClient.js"
import type { PlayerSessionData } from "../types/index.js"
import { deletePlayerSession, listPlayerSessions } from "../repositories/playerSessionRepository.js"
import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import { playerBroadcaster } from "../shared/websocket/PlayerBroadcaster.js"
import { getDiscordErrorCode } from "./discordErrorDetails.js"
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
let restoreInFlight = false

/** Discord API codes meaning the guild or voice channel no longer exists. */
const STALE_SESSION_DISCORD_CODES = new Set([
    10003, // Unknown Channel
    10004, // Unknown Guild
])

function isStaleSessionDiscordError(error: unknown): boolean {
    const code = getDiscordErrorCode(error)
    return code !== undefined && STALE_SESSION_DISCORD_CODES.has(code)
}

type VoiceChannelFetchResult =
    | { status: "found"; channel: VoiceBasedChannel }
    | { status: "missing" }
    | { status: "transient_error" }

/** Called from `clientReady` so restore waits for Discord before touching guild channels. */
export function markDiscordReadyForPlayerRestore(): void {
    discordReady = true
}

/** Attempts restore after Lavalink node connect; re-runs on reconnect for guilds without live players. */
export async function tryRestorePlayerSessionsOnLavalinkConnect(client: BotClient): Promise<void> {
    if (!discordReady || restoreInFlight) return
    restoreInFlight = true
    try {
        await restorePlayerSessions(client)
    } finally {
        restoreInFlight = false
    }
}

async function fetchVoiceChannel(
    client: BotClient,
    guildId: string,
    voiceChannelId: string
): Promise<VoiceChannelFetchResult> {
    let guild = client.guilds.cache.get(guildId)
    if (!guild) {
        try {
            guild = await client.guilds.fetch(guildId)
        } catch (err: unknown) {
            if (isStaleSessionDiscordError(err)) return { status: "missing" }
            return { status: "transient_error" }
        }
    }
    if (!guild) return { status: "missing" }

    const cached = guild.channels.cache.get(voiceChannelId)
    if (cached?.isVoiceBased()) return { status: "found", channel: cached }

    try {
        const fetched = await guild.channels.fetch(voiceChannelId)
        if (fetched?.isVoiceBased()) return { status: "found", channel: fetched }
        return { status: "missing" }
    } catch (err: unknown) {
        if (isStaleSessionDiscordError(err)) return { status: "missing" }
        return { status: "transient_error" }
    }
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

    const voiceResult = await fetchVoiceChannel(client, guildId, voiceChannelId)
    if (voiceResult.status === "transient_error") {
        client.warn(
            `[playerSession] restore deferred for ${guildId}: transient Discord error fetching voice channel ${voiceChannelId}`
        )
        return
    }
    if (voiceResult.status === "missing") {
        client.info(
            `[playerSession] stale session removed for ${guildId}: voice channel ${voiceChannelId} not found`
        )
        try {
            await deletePlayerSession(guildId)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            client.info(`[playerSession] stale session delete failed for ${guildId}: ${msg}`)
        }
        return
    }
    const voiceChannel = voiceResult.channel

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
