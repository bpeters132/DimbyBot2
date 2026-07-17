import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { PlayerSessionSnapshotV1 } from "../types/index.js"
import {
    deletePlayerSession,
    upsertPlayerSession,
} from "../repositories/playerSessionRepository.js"
import { isRRQActive } from "./rrqDisconnect.js"
import { persistedTrackFromLavalink } from "./playerSessionTracks.js"
import { tryGetBotClient } from "../lib/botClientRegistry.js"

const SAVE_DEBOUNCE_MS = 2000

const pendingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPlayers = new Map<string, Player>()
const restoreInProgressGuilds = new Set<string>()
/** Skips the next clearPlayerSession DB delete (failed ephemeral web player teardown). */
const suppressSessionClearGuilds = new Set<string>()
let persistenceShuttingDown = false

/** Prevents playerDestroy from deleting a persisted snapshot after ephemeral player cleanup. */
export function suppressNextPlayerSessionClear(guildId: string): void {
    suppressSessionClearGuilds.add(guildId)
}

/** Set during SIGINT/SIGTERM so playerDestroy does not wipe flushed session rows. */
export function markPlayerSessionPersistenceShuttingDown(): void {
    persistenceShuttingDown = true
}

function repeatModeToLabel(mode: unknown): "off" | "track" | "queue" {
    if (mode === "track" || mode === "queue") return mode
    return "off"
}

/** Builds a v1 snapshot from the live Lavalink player; null when there is nothing to restore. */
export function snapshotFromPlayer(player: Player): PlayerSessionSnapshotV1 | null {
    const currentTrack = player.queue.current
    const current = currentTrack ? persistedTrackFromLavalink(currentTrack) : null
    const queue: PlayerSessionSnapshotV1["queue"] = []
    for (const track of player.queue.tracks) {
        const persisted = persistedTrackFromLavalink(track as Track | UnresolvedTrack)
        if (persisted) queue.push(persisted)
    }
    if (!current && queue.length === 0) return null

    return {
        version: 1,
        volume: typeof player.volume === "number" ? player.volume : 100,
        repeatMode: repeatModeToLabel(player.repeatMode),
        paused: Boolean(player.paused),
        playing: Boolean(player.playing),
        autoplay: player.get("autoplay") === true,
        rrqEnabled: isRRQActive(player),
        current,
        queue,
    }
}

/** Marks a guild as mid-restore so debounced saves do not race with hydration. */
export function markPlayerSessionRestoreInProgress(guildId: string): void {
    restoreInProgressGuilds.add(guildId)
}

/** Clears the restore-in-progress guard after hydration completes. */
export function clearPlayerSessionRestoreInProgress(guildId: string): void {
    restoreInProgressGuilds.delete(guildId)
}

function isRestoreInProgress(guildId: string): boolean {
    return restoreInProgressGuilds.has(guildId)
}

async function writePlayerSession(player: Player): Promise<void> {
    const snapshot = snapshotFromPlayer(player)
    const voiceChannelId = player.voiceChannelId
    if (!voiceChannelId) return

    // Transient empty queue (autoplay handoff, between tracks) must not delete the last
    // good snapshot — only clearPlayerSession removes rows on intentional playerDestroy.
    if (!snapshot) return

    await upsertPlayerSession(
        player.guildId,
        voiceChannelId,
        player.textChannelId ?? null,
        snapshot
    )
}

/** Debounced upsert of the player session snapshot (~2s per guild). */
export function schedulePlayerSessionSave(player: Player): void {
    if (persistenceShuttingDown || isRestoreInProgress(player.guildId)) return

    const guildId = player.guildId
    pendingPlayers.set(guildId, player)
    const existing = pendingSaveTimers.get(guildId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
        pendingSaveTimers.delete(guildId)
        const latest = pendingPlayers.get(guildId)
        pendingPlayers.delete(guildId)
        if (!latest) return
        void writePlayerSession(latest).catch((err: unknown) => {
            const client = tryGetBotClient()
            const msg = err instanceof Error ? err.message : String(err)
            if (client) {
                client.error(`[playerSession] save failed for guild ${guildId}: ${msg}`)
            } else {
                console.error(`[playerSession] save failed for guild ${guildId}: ${msg}`)
            }
        })
    }, SAVE_DEBOUNCE_MS)

    pendingSaveTimers.set(guildId, timer)
    if (typeof timer.unref === "function") timer.unref()
}

/** Immediately persists the latest snapshot for one guild. */
export async function flushPlayerSessionSave(guildId: string): Promise<void> {
    const timer = pendingSaveTimers.get(guildId)
    if (timer) {
        clearTimeout(timer)
        pendingSaveTimers.delete(guildId)
    }
    const player = pendingPlayers.get(guildId)
    pendingPlayers.delete(guildId)
    if (player) {
        await writePlayerSession(player)
    }
}

/** Flushes all pending debounced saves and snapshots for active Lavalink players. */
export async function flushAllPlayerSessionSaves(): Promise<void> {
    const guildIds = new Set([...pendingSaveTimers.keys(), ...pendingPlayers.keys()])
    for (const guildId of guildIds) {
        await flushPlayerSessionSave(guildId)
    }

    const client = tryGetBotClient()
    if (!client) return
    for (const player of client.lavalink.players.values()) {
        if (isRestoreInProgress(player.guildId)) continue
        try {
            await writePlayerSession(player)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            client.error(
                `[playerSession] flushAll write failed for guild ${player.guildId}: ${msg}`
            )
        }
    }
}

/** Removes a persisted session row (intentional destroy or stale cleanup). */
export async function clearPlayerSession(guildId: string): Promise<void> {
    const timer = pendingSaveTimers.get(guildId)
    if (timer) {
        clearTimeout(timer)
        pendingSaveTimers.delete(guildId)
    }
    pendingPlayers.delete(guildId)
    // Shutdown flush, mid-restore cleanup, and ephemeral web teardown own row lifetime.
    if (
        persistenceShuttingDown ||
        isRestoreInProgress(guildId) ||
        suppressSessionClearGuilds.delete(guildId)
    ) {
        return
    }
    await deletePlayerSession(guildId)
}
