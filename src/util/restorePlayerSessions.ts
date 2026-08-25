import type { VoiceBasedChannel } from "discord.js"
import type { Player } from "lavalink-client"
import type BotClient from "../lib/BotClient.js"
import type { PlayerSessionData } from "../types/index.js"
import { deletePlayerSession, listPlayerSessions } from "../repositories/playerSessionRepository.js"
import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import { playerBroadcaster } from "../shared/websocket/PlayerBroadcaster.js"
import { getDiscordErrorCode } from "./discordErrorDetails.js"
import { getGuildSettings } from "./saveControlChannel.js"
import { ensurePlayerConnected, startPlaybackIfNeeded } from "./musicManager.js"
import {
    clearPlayerSessionPreservePriorSnapshot,
    clearPlayerSessionRestoreInProgress,
    markPlayerSessionPreservePriorSnapshot,
    markPlayerSessionRestoreInProgress,
    schedulePlayerSessionSave,
} from "./playerSessionPersistence.js"
import { resolvePersistedTracks } from "./playerSessionTracks.js"
import {
    resolveYoutubePlaybackTracks,
    companionPlaybackConfig,
} from "./youtubeCompanionPlayback.js"
import {
    withGuildPlayerLifecycleReservation,
    withGuildPlayerQueueLock,
} from "./guildPlayerQueueLock.js"
import { countHumanMembers } from "./voiceChannelMembers.js"

/**
 * Whether a successful partial hydrate may overwrite the persisted session snapshot.
 * Transient resolve failures must keep the prior full snapshot on disk.
 */
export function shouldPersistRestoredPlayerSession(transientFailures: number): boolean {
    return transientFailures <= 0
}

/**
 * True when restore must not destroy the live player / delete the session row because
 * another request already enqueued content on the player created for hydrate.
 * `/play` saves are no-ops while restore-in-progress, so destroying here would drop
 * that live queue with no DB copy.
 */
export function shouldAbandonRestoreForConcurrentQueue(player: {
    queue: { current?: unknown; tracks: { length: number } }
}): boolean {
    return Boolean(player.queue.current) || player.queue.tracks.length > 0
}

/**
 * True when the hydrate Player is still the guild's live manager entry.
 * Intentional `/stop` + `/play` during companion/decode resolve can destroy the
 * restore-created Player and install a successor; mutating the zombie or calling
 * `deletePlayerSession` would corrupt or wipe that live session.
 */
export function isRestoreHydratePlayerStillLive(
    restorePlayer: object,
    livePlayer: object | null | undefined
): boolean {
    return livePlayer != null && livePlayer === restorePlayer
}

let discordReady = false
let restoreInFlight = false

/** Discord API codes meaning the guild or voice channel no longer exists. */
const STALE_SESSION_DISCORD_CODES = new Set([
    10003, // Unknown Channel
    10004, // Unknown Guild
])

/**
 * True when a Discord API failure means the persisted voice channel/guild is gone
 * (safe to delete the session). Transient/network errors must return false so restore
 * can retry later without wiping the queue snapshot.
 */
export function isStaleSessionDiscordError(error: unknown): boolean {
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

    let playerToPersist: Player | null = null
    /** Restore-created Player; used for identity gates after destroy/successor races. */
    let restorePlayer: Player | null = null
    try {
        await withGuildPlayerLifecycleReservation(guildId, async () => {
            // Re-check under the reservation: a concurrent create may have won the race.
            if (client.lavalink.getPlayer(guildId)) {
                client.debug(
                    `[playerSession] restore skipped for ${guildId}: player appeared before hydrate`
                )
                return
            }

            const player = await client.lavalink.createPlayer({
                guildId,
                voiceChannelId,
                textChannelId: textChannelId ?? undefined,
                selfDeaf: true,
                volume: snapshot.volume,
            })
            restorePlayer = player

            await ensurePlayerConnected(client, player, voiceChannel)

            const { resolved, failed, transientFailures } = await resolvePersistedTracks(
                player,
                tracksToRestore
            )
            const playable = await resolveYoutubePlaybackTracks(
                player,
                resolved,
                companionPlaybackConfig(client)
            )
            const companionFailed = resolved.length - playable.length
            const failedTotal = failed + companionFailed
            const transientTotal = transientFailures + companionFailed
            if (failedTotal > 0) {
                client.warn(
                    `[playerSession] restore for ${guildId}: ${failedTotal}/${tracksToRestore.length} tracks failed to resolve` +
                        (transientTotal > 0 ? ` (${transientTotal} transient)` : "")
                )
            }
            if (playable.length === 0) {
                // Concurrent /play (or web enqueue) may have filled this player while we resolved.
                // Saves are blocked during restore-in-progress — destroying would drop that queue.
                // Serialize check + destroy under the guild queue lock so an enqueue cannot land
                // between shouldAbandonRestoreForConcurrentQueue and player.destroy().
                // Also identity-gate: /stop+/play during resolve installs a successor — never
                // destroy/delete against the zombie restore Player (would wipe the new session).
                const zeroResolve = await withGuildPlayerQueueLock(guildId, async () => {
                    const live = client.lavalink.getPlayer(guildId)
                    if (!isRestoreHydratePlayerStillLive(player, live)) {
                        return "successor" as const
                    }
                    if (shouldAbandonRestoreForConcurrentQueue(player)) {
                        return "concurrent" as const
                    }
                    await player.destroy()
                    return "destroyed" as const
                })
                if (zeroResolve === "successor") {
                    client.warn(
                        `[playerSession] restore for ${guildId}: no tracks resolved but live player changed; leaving successor alone`
                    )
                    return
                }
                if (zeroResolve === "concurrent") {
                    client.warn(
                        `[playerSession] restore for ${guildId}: no tracks resolved but live queue has content; keeping player`
                    )
                    // Drop a leftover preserve guard so schedulePlayerSessionSave after finally can run.
                    clearPlayerSessionPreservePriorSnapshot(guildId)
                    playerToPersist = player
                    return
                }
                // Lavalink/source blips that throw during decode/search must not wipe the snapshot.
                // Deterministic no-match (search returned nothing usable) still deletes.
                if (transientTotal > 0) {
                    client.warn(
                        `[playerSession] restore for ${guildId}: no tracks resolved due to transient failures; preserving session`
                    )
                    return
                }
                client.warn(
                    `[playerSession] restore for ${guildId}: no tracks resolved; destroying player`
                )
                await deletePlayerSession(guildId)
                return
            }

            const hydrated = await withGuildPlayerQueueLock(guildId, async () => {
                const live = client.lavalink.getPlayer(guildId)
                // Successor owns the guild — do not queue.add / save on the zombie restore Player.
                if (!isRestoreHydratePlayerStillLive(player, live)) {
                    return "successor" as const
                }
                // User won the race on this same player: keep their queue instead of appending.
                if (shouldAbandonRestoreForConcurrentQueue(player)) {
                    return "concurrent" as const
                }
                await player.queue.add(playable)
                return "hydrated" as const
            })

            if (hydrated === "successor") {
                client.warn(
                    `[playerSession] restore for ${guildId}: skipped hydrate; live player changed during resolve`
                )
                return
            }

            if (hydrated === "concurrent") {
                client.warn(
                    `[playerSession] restore for ${guildId}: skipped hydrate; concurrent queue content present`
                )
                clearPlayerSessionPreservePriorSnapshot(guildId)
                playerToPersist = player
                scheduleControlMessageUpdate(client, guildId)
                playerBroadcaster.broadcastPlayerEvent(guildId, player, "queueUpdate")
                return
            }

            // Re-check after releasing the queue lock: /stop may have replaced the player.
            if (!isRestoreHydratePlayerStillLive(player, client.lavalink.getPlayer(guildId))) {
                client.warn(
                    `[playerSession] restore for ${guildId}: live player changed after hydrate; skipping playback setup`
                )
                return
            }

            if (snapshot.repeatMode !== "off") {
                await player.setRepeatMode(snapshot.repeatMode)
            }
            player.set("autoplay", snapshot.autoplay)
            player.set("rrqEnabled", snapshot.rrqEnabled)

            await startPlaybackIfNeeded(player)
            if (
                snapshot.paused &&
                player.playing &&
                isRestoreHydratePlayerStillLive(player, client.lavalink.getPlayer(guildId))
            ) {
                await player.pause()
            }

            if (!isRestoreHydratePlayerStillLive(player, client.lavalink.getPlayer(guildId))) {
                client.warn(
                    `[playerSession] restore for ${guildId}: live player changed during playback setup; not persisting restore player`
                )
                return
            }

            client.info(
                `[playerSession] restored player for guild ${guildId} (${playable.length} tracks, humans=${humans})`
            )

            scheduleControlMessageUpdate(client, guildId)
            playerBroadcaster.broadcastPlayerEvent(guildId, player, "queueUpdate")
            // schedulePlayerSessionSave is a no-op while restore-in-progress; persist after clear.
            // Skip save when some tracks failed transiently — otherwise a partial hydrate would
            // permanently drop those entries from the session snapshot. Mark preserve *before*
            // clearPlayerSessionRestoreInProgress so trackStart/trackEnd/shutdown/idle clear
            // cannot race and wipe the prior full row.
            if (shouldPersistRestoredPlayerSession(transientTotal)) {
                clearPlayerSessionPreservePriorSnapshot(guildId)
                playerToPersist = player
            } else {
                markPlayerSessionPreservePriorSnapshot(guildId)
                client.warn(
                    `[playerSession] restore for ${guildId}: skipping session save after ${transientTotal} transient failure(s); preserving prior snapshot`
                )
            }
        })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        client.error(`[playerSession] restore failed for guild ${guildId}: ${msg}`)
        // Compare against the restore-created Player. getPlayer alone is not enough: a
        // successor would look like a live orphan and must not be destroyed here.
        const liveNow = client.lavalink.getPlayer(guildId)
        if (
            restorePlayer &&
            liveNow &&
            isRestoreHydratePlayerStillLive(restorePlayer, liveNow)
        ) {
            const abandoned = await withGuildPlayerQueueLock(guildId, async () => {
                const live = client.lavalink.getPlayer(guildId)
                if (!isRestoreHydratePlayerStillLive(restorePlayer, live)) {
                    return "successor" as const
                }
                if (shouldAbandonRestoreForConcurrentQueue(liveNow)) return "concurrent" as const
                await liveNow.destroy().catch(() => undefined)
                return "destroyed" as const
            })
            if (abandoned === "concurrent") {
                client.warn(
                    `[playerSession] restore for ${guildId}: error after concurrent enqueue; keeping player`
                )
                clearPlayerSessionPreservePriorSnapshot(guildId)
                playerToPersist = liveNow
            } else {
                playerToPersist = null
            }
        } else {
            if (liveNow && restorePlayer && liveNow !== restorePlayer) {
                client.warn(
                    `[playerSession] restore for ${guildId}: error after live player changed; leaving successor alone`
                )
            }
            playerToPersist = null
        }
        // Transient failures (Lavalink/Discord blips) must not wipe the persisted snapshot.
    } finally {
        clearPlayerSessionRestoreInProgress(guildId)
    }

    if (playerToPersist) {
        // Final identity gate: never persist a zombie after /stop+/play during restore.
        if (isRestoreHydratePlayerStillLive(playerToPersist, client.lavalink.getPlayer(guildId))) {
            schedulePlayerSessionSave(playerToPersist)
        }
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
