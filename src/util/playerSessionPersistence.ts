import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { PlayerSessionSnapshotV1 } from "../types/index.js"
import {
    deletePlayerSession,
    upsertPlayerSession,
} from "../repositories/playerSessionRepository.js"
import { isRRQActive } from "./rrqDisconnect.js"
import { persistedTrackFromLavalink } from "./playerSessionTracks.js"
import { tryGetBotClient } from "../lib/botClientRegistry.js"
import { createGuildAsyncChain } from "./guildAsyncChain.js"

const SAVE_DEBOUNCE_MS = 2000

const pendingSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPlayers = new Map<string, Player>()
const restoreInProgressGuilds = new Set<string>()
/** Bumped on intentional clear so in-flight debounced writes cannot resurrect deleted rows. */
const sessionClearEpochByGuild = new Map<string, number>()
/**
 * Bumped on intentional clear and each write claim. Stale post-upsert undo deletes only when
 * this still matches the write's claimed generation — so a newer persist survives.
 */
const sessionPersistGenerationByGuild = new Map<string, number>()
/**
 * Operation-scoped suppress leases (refcounted per guild).
 * Successful destroy: clearPlayerSession consumes one; failed destroy: that lease.release().
 */
const suppressLeaseCountByGuild = new Map<string, number>()
let nextSuppressLeaseId = 1
let persistenceShuttingDown = false

/** Per-guild FIFO so DB upsert/delete completion order matches generation claim order. */
const withGuildPersistenceLock = createGuildAsyncChain()

/** Injectable DB ops so regression tests can defer upsert/delete completion. */
type PlayerSessionPersistenceDb = {
    upsertPlayerSession: typeof upsertPlayerSession
    deletePlayerSession: typeof deletePlayerSession
}

let persistenceDb: PlayerSessionPersistenceDb = {
    upsertPlayerSession,
    deletePlayerSession,
}

/** Test-only: replace upsert/delete (pass `null` to restore defaults). */
export function setPlayerSessionPersistenceDbForTests(
    next: Partial<PlayerSessionPersistenceDb> | null
): void {
    persistenceDb = next
        ? {
              upsertPlayerSession: next.upsertPlayerSession ?? persistenceDb.upsertPlayerSession,
              deletePlayerSession: next.deletePlayerSession ?? persistenceDb.deletePlayerSession,
          }
        : { upsertPlayerSession, deletePlayerSession }
}

/** Test-only: enqueue work on the same per-guild persistence chain as writes/clears. */
export function enqueueGuildPersistenceTaskForTests<T>(
    guildId: string,
    work: () => Promise<T>
): Promise<T> {
    return withGuildPersistenceLock(guildId, work)
}

function getSessionClearEpoch(guildId: string): number {
    return sessionClearEpochByGuild.get(guildId) ?? 0
}

function bumpSessionClearEpoch(guildId: string): number {
    const next = getSessionClearEpoch(guildId) + 1
    sessionClearEpochByGuild.set(guildId, next)
    return next
}

function getSessionPersistGeneration(guildId: string): number {
    return sessionPersistGenerationByGuild.get(guildId) ?? 0
}

function bumpSessionPersistGeneration(guildId: string): number {
    const next = getSessionPersistGeneration(guildId) + 1
    sessionPersistGenerationByGuild.set(guildId, next)
    return next
}

/**
 * True when an in-flight upsert should delete its row after a clear invalidated it.
 * False when a newer persist already claimed a higher generation (newer snapshot must survive).
 */
export function shouldUndoStaleSessionUpsert(
    currentClearEpoch: number,
    saveEpoch: number,
    currentPersistGeneration: number,
    writeGeneration: number
): boolean {
    return currentClearEpoch !== saveEpoch && currentPersistGeneration === writeGeneration
}

function getSuppressLeaseCount(guildId: string): number {
    return suppressLeaseCountByGuild.get(guildId) ?? 0
}

function hasActiveSuppressLease(guildId: string): boolean {
    return getSuppressLeaseCount(guildId) > 0
}

/** Decrements one suppress lease for this guild (no-op when none remain). */
function releaseOneSuppressLease(guildId: string): void {
    const count = getSuppressLeaseCount(guildId)
    if (count <= 0) return
    if (count === 1) suppressLeaseCountByGuild.delete(guildId)
    else suppressLeaseCountByGuild.set(guildId, count - 1)
}

/** Lease that skips clearPlayerSession DB delete for one ephemeral destroy attempt. */
export type PlayerSessionClearSuppressLease = {
    readonly guildId: string
    readonly id: number
    /** Releases only this lease; safe to call more than once. */
    release(): void
}

/**
 * Acquires an operation-scoped suppress lease for ephemeral player teardown.
 * A successful session clear (via playerDestroy → clearPlayerSession) consumes the lease;
 * callers should invoke `release()` only when the associated destroyPlayer call fails.
 */
export function acquirePlayerSessionClearSuppressLease(
    guildId: string
): PlayerSessionClearSuppressLease {
    const id = nextSuppressLeaseId++
    suppressLeaseCountByGuild.set(guildId, getSuppressLeaseCount(guildId) + 1)
    let released = false
    return {
        guildId,
        id,
        release() {
            if (released) return
            released = true
            releaseOneSuppressLease(guildId)
        },
    }
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

/**
 * Pure guard used by clearPlayerSession: shutdown flush, mid-restore, and suppress leases.
 * Exported for regression tests.
 */
export function shouldSkipPlayerSessionClearForState(
    shuttingDown: boolean,
    restoreInProgress: boolean,
    suppressNextClear = false
): boolean {
    return shuttingDown || restoreInProgress || suppressNextClear
}

/** True when clearPlayerSession must not delete the DB row for this guild. */
export function shouldSkipPlayerSessionClear(guildId: string): boolean {
    return shouldSkipPlayerSessionClearForState(
        persistenceShuttingDown,
        isRestoreInProgress(guildId),
        hasActiveSuppressLease(guildId)
    )
}

async function writePlayerSession(player: Player, saveEpoch: number): Promise<void> {
    if (getSessionClearEpoch(player.guildId) !== saveEpoch) return

    const snapshot = snapshotFromPlayer(player)
    const voiceChannelId = player.voiceChannelId
    if (!voiceChannelId) return

    // Transient empty queue (autoplay handoff, between tracks) must not delete the last
    // good snapshot — only clearPlayerSession removes rows on intentional playerDestroy.
    if (!snapshot) return

    const guildId = player.guildId
    await withGuildPersistenceLock(guildId, async () => {
        // Re-check under the lock: a clear may have landed while we waited for the chain.
        if (getSessionClearEpoch(guildId) !== saveEpoch) return

        // Claim a persist generation before awaiting so a newer write/clear can outrank this undo.
        const writeGeneration = bumpSessionPersistGeneration(guildId)

        await persistenceDb.upsertPlayerSession(
            guildId,
            voiceChannelId,
            player.textChannelId ?? null,
            snapshot
        )

        // clearPlayerSession may invalidate this write — undo only if still the latest generation.
        if (
            shouldUndoStaleSessionUpsert(
                getSessionClearEpoch(guildId),
                saveEpoch,
                getSessionPersistGeneration(guildId),
                writeGeneration
            )
        ) {
            await persistenceDb.deletePlayerSession(guildId).catch(() => undefined)
        }
    })
}

/** Test-only: run a write through the serialized persist path. */
export async function writePlayerSessionForTests(player: Player, saveEpoch: number): Promise<void> {
    await writePlayerSession(player, saveEpoch)
}

/** Test-only: current clear epoch for a guild (for scheduling writes in race tests). */
export function getSessionClearEpochForTests(guildId: string): number {
    return getSessionClearEpoch(guildId)
}

/** Debounced upsert of the player session snapshot (~2s per guild). */
export function schedulePlayerSessionSave(player: Player): void {
    if (persistenceShuttingDown || isRestoreInProgress(player.guildId)) return

    const guildId = player.guildId
    const saveEpoch = getSessionClearEpoch(guildId)
    pendingPlayers.set(guildId, player)
    const existing = pendingSaveTimers.get(guildId)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
        pendingSaveTimers.delete(guildId)
        const latest = pendingPlayers.get(guildId)
        pendingPlayers.delete(guildId)
        if (!latest || getSessionClearEpoch(guildId) !== saveEpoch) return
        void writePlayerSession(latest, saveEpoch).catch((err: unknown) => {
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
        await writePlayerSession(player, getSessionClearEpoch(guildId))
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
            await writePlayerSession(player, getSessionClearEpoch(player.guildId))
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
    // Evaluate preserve/skip before bumping the clear epoch or cancelling pending saves.
    // Skipped clears (shutdown, restore, ephemeral suppress) must not invalidate in-flight
    // writes — the stale-resurrection undo in writePlayerSession would delete protected rows.
    const hasSuppressLease = hasActiveSuppressLease(guildId)
    if (
        shouldSkipPlayerSessionClearForState(
            persistenceShuttingDown,
            isRestoreInProgress(guildId),
            hasSuppressLease
        )
    ) {
        // Successful ephemeral destroy: consume one lease (handlers release only on reject).
        if (hasSuppressLease) releaseOneSuppressLease(guildId)
        return
    }

    // Bump before awaiting the persistence lock so immediately following saves capture the new epoch.
    bumpSessionClearEpoch(guildId)
    // Invalidate in-flight write undos so they cannot delete a row rewritten after this clear.
    bumpSessionPersistGeneration(guildId)

    const timer = pendingSaveTimers.get(guildId)
    if (timer) {
        clearTimeout(timer)
        pendingSaveTimers.delete(guildId)
    }
    pendingPlayers.delete(guildId)

    await withGuildPersistenceLock(guildId, async () => {
        await persistenceDb.deletePlayerSession(guildId)
    })
}
