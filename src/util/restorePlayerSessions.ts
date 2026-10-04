import type { VoiceBasedChannel } from "discord.js"
import type { Player } from "lavalink-client"
import type BotClient from "../lib/BotClient.js"
import type { PlayerSessionData } from "../types/index.js"
import {
    deletePlayerSessionIfUnchanged,
    getPlayerSession,
    listPlayerSessions,
} from "../repositories/playerSessionRepository.js"
import { updateControlMessage } from "../events/handlers/handleControlChannel.js"
import { playerBroadcaster } from "../shared/websocket/PlayerBroadcaster.js"
import { getDiscordErrorCode } from "./discordErrorDetails.js"
import { getGuildSettings } from "./saveControlChannel.js"
import { ensurePlayerConnected } from "./musicManager.js"
import { startPlaybackIfNeeded } from "./startPlaybackIfNeeded.js"
import {
    clearPlayerSessionPreservePriorSnapshot,
    clearPlayerSessionRestoreInProgress,
    markPlayerSessionPreservePriorSnapshot,
    markPlayerSessionRestoreInProgress,
    schedulePlayerSessionSave,
} from "./playerSessionPersistence.js"
import { resolvePersistedTracks } from "./playerSessionTracks.js"
import { queueTrackIdentity, schedulePrefetchWindow } from "./youtubePlaybackWindow.js"
import {
    withGuildPlayerLifecycleReservation,
    withGuildPlayerQueueLock,
} from "./guildPlayerQueueLock.js"
import { countHumanMembers } from "./voiceChannelMembers.js"

/**
 * Live current + upcoming length. Used so restore persist can detect JIT prepare drops.
 */
export function restoredLiveTrackCount(player: {
    queue: { current?: unknown; tracks: { length: number } }
}): number {
    return (player.queue.current ? 1 : 0) + player.queue.tracks.length
}

type QueueIdentityTrack = Parameters<typeof queueTrackIdentity>[0]

/**
 * How many restored tracks are still on the live queue, matched by URI identity.
 * A concurrent `/play` can replace a dropped restored track and keep the counts equal.
 */
export function retainedRestoredTrackCount(
    restored: readonly { info?: { uri?: string | null } }[],
    live: readonly { info?: { uri?: string | null } }[]
): number {
    const available = new Map<string, number>()
    for (const track of live) {
        const id = queueTrackIdentity(track as QueueIdentityTrack)
        if (!id) continue
        available.set(id, (available.get(id) ?? 0) + 1)
    }
    let retained = 0
    for (const track of restored) {
        const id = queueTrackIdentity(track as QueueIdentityTrack)
        const left = id ? (available.get(id) ?? 0) : 0
        if (left <= 0) continue
        available.set(id, left - 1)
        retained += 1
    }
    return retained
}

/**
 * Whether a successful hydrate may overwrite the persisted session snapshot.
 * Transient resolve failures, JIT playback-window drops (thinned live queue),
 * and a live queue that no longer contains every restored track must keep the
 * prior full snapshot on disk.
 */
export function shouldPersistRestoredPlayerSession(options: {
    transientFailures: number
    storedPlayableCount: number
    liveTrackCount: number
    retainedRestoredCount: number
}): boolean {
    if (options.transientFailures > 0) return false
    if (options.liveTrackCount < options.storedPlayableCount) return false
    if (options.retainedRestoredCount < options.storedPlayableCount) return false
    return true
}

/**
 * Whether a concurrent-enqueue abandon may overwrite the persisted session row.
 *
 * When restore still has playable tracks (or only transient resolve failures), saving the
 * thin live queue permanently drops the fuller snapshot. Only when every stored track failed
 * deterministically is it safe to persist the concurrent live queue as the new session.
 */
export function shouldPersistConcurrentAbandonSession(options: {
    playableCount: number
    transientFailures: number
}): boolean {
    if (options.playableCount > 0) return false
    if (options.transientFailures > 0) return false
    return true
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

type RestoreLivePlayer = {
    queue: { current?: unknown; tracks: { length: number } }
}

/**
 * True when restore must not hydrate onto an existing manager player because a concurrent
 * `/play` / Dashboard enqueue already owns a queue. Empty shells (createPlayer before search
 * finished, or a failed search that has not been torn down) must still be hydrated — an
 * existence-only skip leaves the persisted snapshot unapplied.
 */
export function shouldSkipRestoreHydrateForLivePlayer(
    live: RestoreLivePlayer | null | undefined
): boolean {
    return live != null && shouldAbandonRestoreForConcurrentQueue(live)
}

/**
 * Transient Discord VC fetch defers restore without hydrating. Concurrent `/play` saves are
 * no-ops until restore-in-progress clears; if the live player already has queue content, the
 * next save would replace the fuller snapshot unless preserve-prior is set (same contract as
 * {@link shouldSkipRestoreHydrateForLivePlayer} / #240).
 *
 * Do not mark when nothing concurrent landed — a later `/play` after restore has given up
 * is new user intent and must be allowed to persist.
 */
export function shouldPreservePriorSnapshotAfterRestoreDefer(
    live: RestoreLivePlayer | null | undefined
): boolean {
    return shouldSkipRestoreHydrateForLivePlayer(live)
}

/**
 * After a deferred restore, mark preserve-prior only while the persisted session
 * row is still there and the live player already has a queue. `/stop` deletes
 * the row; the successor queue must be allowed to persist once restore-in-progress
 * clears. A concurrent `/play` leaves the row in place.
 */
export function shouldMarkPreservePriorAfterDeferredRestore(options: {
    sessionRowExists: boolean
    liveHasQueue: boolean
}): boolean {
    return options.sessionRowExists && options.liveHasQueue
}

/**
 * Guilds whose DB snapshots must not be overwritten by concurrent `/play` saves until the
 * sequential restore pass finishes — including guilds not yet reached in the loop.
 */
export function guildIdsNeedingRestoreSaveGuard(
    sessions: readonly { guildId: string }[]
): string[] {
    return [...new Set(sessions.map((session) => session.guildId))]
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

/**
 * True when restore may delete the DB row after deciding a session is stale.
 * Concurrent `/play` can upsert a successor session (or create a live player) during
 * voice-channel fetch — never delete by guildId alone.
 */
export function shouldDeleteStaleRestoredSession(args: {
    evaluated: Pick<PlayerSessionData, "voiceChannelId" | "updatedAt">
    latest: Pick<PlayerSessionData, "voiceChannelId" | "updatedAt"> | null
    livePlayerExists: boolean
}): boolean {
    if (args.livePlayerExists) return false
    if (!args.latest) return false
    return (
        args.latest.voiceChannelId === args.evaluated.voiceChannelId &&
        args.latest.updatedAt.getTime() === args.evaluated.updatedAt.getTime()
    )
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

/** Deletes the evaluated session only when no live player exists and the DB row is unchanged. */
async function deleteStaleSessionIfUnchanged(
    client: BotClient,
    session: PlayerSessionData
): Promise<void> {
    await withGuildPlayerQueueLock(session.guildId, async () => {
        const latest = await getPlayerSession(session.guildId)
        if (
            !shouldDeleteStaleRestoredSession({
                evaluated: session,
                latest,
                livePlayerExists: Boolean(client.lavalink.getPlayer(session.guildId)),
            })
        ) {
            client.debug(
                `[playerSession] skip stale delete for ${session.guildId}: live player or successor session present`
            )
            return
        }
        await deletePlayerSessionIfUnchanged(session)
    })
}

async function safeDeleteStaleSession(
    client: BotClient,
    session: PlayerSessionData
): Promise<void> {
    try {
        await deleteStaleSessionIfUnchanged(client, session)
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        client.info(`[playerSession] stale session delete failed for ${session.guildId}: ${msg}`)
    }
}

function resolveTextChannelId(session: PlayerSessionData): string | null {
    if (session.textChannelId) return session.textChannelId
    const settings = getGuildSettings()[session.guildId]
    return settings?.controlChannelId ?? null
}

async function restoreSingleSession(
    client: BotClient,
    session: PlayerSessionData
): Promise<"completed" | "deferred"> {
    const { guildId, voiceChannelId, snapshot } = session

    const existingBeforeRestore = client.lavalink.getPlayer(guildId)
    if (shouldSkipRestoreHydrateForLivePlayer(existingBeforeRestore)) {
        // Same contract as concurrent-abandon during resolve (#240): skipping hydrate
        // without preserve-prior lets schedulePlayerSessionSave replace a multi-track
        // snapshot. Existence-only skip is wrong for an empty createPlayer shell.
        markPlayerSessionPreservePriorSnapshot(guildId)
        client.debug(
            `[playerSession] restore skipped for ${guildId}: live player already has queue content`
        )
        return "completed"
    }

    const voiceResult = await fetchVoiceChannel(client, guildId, voiceChannelId)
    if (voiceResult.status === "transient_error") {
        client.warn(
            `[playerSession] restore deferred for ${guildId}: transient Discord error fetching voice channel ${voiceChannelId}`
        )
        // Do not mark preserve-prior here. `/stop` can delete the session row while
        // this fetch is in flight, and a successor `/play` can fill the live queue
        // before we return. An early mark would stick after the batch finally sees
        // no row and skips its own mark, blocking successor saves. The finally applies
        // shouldMarkPreservePriorAfterDeferredRestore before restore-in-progress clears.
        return "deferred"
    }
    if (voiceResult.status === "missing") {
        client.info(
            `[playerSession] stale session removed for ${guildId}: voice channel ${voiceChannelId} not found`
        )
        await safeDeleteStaleSession(client, session)
        return "completed"
    }
    const voiceChannel = voiceResult.channel

    const humans = countHumanMembers(voiceChannel)
    if (humans === 0) {
        client.info(
            `[playerSession] stale session removed for ${guildId}: no humans in VC ${voiceChannelId}`
        )
        await safeDeleteStaleSession(client, session)
        return "completed"
    }

    const tracksToRestore = [...(snapshot.current ? [snapshot.current] : []), ...snapshot.queue]
    if (tracksToRestore.length === 0) {
        await safeDeleteStaleSession(client, session)
        return "completed"
    }

    const textChannelId = resolveTextChannelId(session)
    markPlayerSessionRestoreInProgress(guildId)

    let playerToPersist: Player | null = null
    /** Restore-created Player; used for identity gates after destroy/successor races. */
    let restorePlayer: Player | null = null
    try {
        await withGuildPlayerLifecycleReservation(guildId, async () => {
            // Re-check under the reservation: a concurrent create may have won the race.
            const liveBeforeCreate = client.lavalink.getPlayer(guildId)
            if (shouldSkipRestoreHydrateForLivePlayer(liveBeforeCreate)) {
                markPlayerSessionPreservePriorSnapshot(guildId)
                client.debug(
                    `[playerSession] restore skipped for ${guildId}: player appeared before hydrate`
                )
                return
            }

            const player =
                liveBeforeCreate ??
                (await client.lavalink.createPlayer({
                    guildId,
                    voiceChannelId,
                    textChannelId: textChannelId ?? undefined,
                    selfDeaf: true,
                    volume: snapshot.volume,
                }))
            restorePlayer = player

            await ensurePlayerConnected(client, player, voiceChannel)

            const { resolved, failed, transientFailures } = await resolvePersistedTracks(
                player,
                tracksToRestore
            )
            const playable = resolved
            const failedTotal = failed
            const transientTotal = transientFailures
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
                    if (
                        shouldPersistConcurrentAbandonSession({
                            playableCount: 0,
                            transientFailures: transientTotal,
                        })
                    ) {
                        // Deterministic resolve miss: prior snapshot was unrecoverable; keep live queue.
                        clearPlayerSessionPreservePriorSnapshot(guildId)
                        playerToPersist = player
                    } else {
                        // Transient failures + concurrent enqueue must not wipe the fuller DB row.
                        markPlayerSessionPreservePriorSnapshot(guildId)
                    }
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
                await deletePlayerSessionIfUnchanged(session)
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
                // Keep the prior full snapshot: schedulePlayerSessionSave of the thin concurrent
                // queue would permanently drop the restored session from the DB.
                markPlayerSessionPreservePriorSnapshot(guildId)
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

            await startPlaybackIfNeeded(player, () => client.lavalink.getPlayer(guildId))
            schedulePrefetchWindow(() => client.lavalink.getPlayer(guildId), guildId)
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
            // Skip save when some tracks failed transiently OR JIT prepare dropped heads
            // (false-permanent catalog/search misses during node warmup). Otherwise a
            // thinned live queue would replace the fuller DB row. Mark preserve *before*
            // clearPlayerSessionRestoreInProgress so trackStart/trackEnd/shutdown/idle clear
            // cannot race and wipe the prior full row.
            const liveTracks = [
                ...(player.queue.current ? [player.queue.current] : []),
                ...player.queue.tracks,
            ]
            const liveCount = liveTracks.length
            const retained = retainedRestoredTrackCount(playable, liveTracks)
            if (
                shouldPersistRestoredPlayerSession({
                    transientFailures: transientTotal,
                    storedPlayableCount: playable.length,
                    liveTrackCount: liveCount,
                    retainedRestoredCount: retained,
                })
            ) {
                clearPlayerSessionPreservePriorSnapshot(guildId)
                playerToPersist = player
            } else {
                markPlayerSessionPreservePriorSnapshot(guildId)
                const dropped = Math.max(0, playable.length - liveCount)
                const missing = Math.max(0, playable.length - retained)
                client.warn(
                    `[playerSession] restore for ${guildId}: skipping session save` +
                        (transientTotal > 0
                            ? ` after ${transientTotal} transient failure(s)`
                            : missing > 0
                              ? ` after ${missing} restored track(s) left the live queue`
                              : ` after JIT prepare dropped ${dropped} track(s)`) +
                        "; preserving prior snapshot"
                )
            }
        })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        client.error(`[playerSession] restore failed for guild ${guildId}: ${msg}`)
        // Compare against the restore-created Player. getPlayer alone is not enough: a
        // successor would look like a live orphan and must not be destroyed here.
        const liveNow = client.lavalink.getPlayer(guildId)
        if (restorePlayer && liveNow && isRestoreHydratePlayerStillLive(restorePlayer, liveNow)) {
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
                // Failed restore must not overwrite the prior snapshot with a concurrent thin queue.
                markPlayerSessionPreservePriorSnapshot(guildId)
            }
            playerToPersist = null
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
    return "completed"
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
    // Mark every guild before the sequential loop. restore-in-progress is otherwise set
    // only after voice fetch inside restoreSingleSession, so a concurrent /play on a
    // later guild can persist a thin live queue over the fuller snapshot (#240 hole).
    const restoreGuildIds = guildIdsNeedingRestoreSaveGuard(sessions)
    for (const id of restoreGuildIds) {
        markPlayerSessionRestoreInProgress(id)
    }
    const deferredGuildIds: string[] = []
    try {
        for (const session of sessions) {
            const result = await restoreSingleSession(client, session)
            if (result === "deferred") deferredGuildIds.push(session.guildId)
        }
        return true
    } finally {
        // `/play` can land after a transient defer but while later guilds are still
        // restoring (outer restore-in-progress still blocks saves). Re-check live
        // queues before dropping that guard so a thin session cannot overwrite the
        // fuller snapshot. `/stop` deletes that row first; do not mark preserve-prior
        // then, or the successor queue cannot be saved after this guard clears.
        const deferred = new Set(deferredGuildIds)
        for (const id of restoreGuildIds) {
            if (deferred.has(id)) {
                const row = await getPlayerSession(id)
                if (
                    shouldMarkPreservePriorAfterDeferredRestore({
                        sessionRowExists: row != null,
                        liveHasQueue: shouldPreservePriorSnapshotAfterRestoreDefer(
                            client.lavalink.getPlayer(id)
                        ),
                    })
                ) {
                    markPlayerSessionPreservePriorSnapshot(id)
                }
            }
            clearPlayerSessionRestoreInProgress(id)
        }
    }
}
