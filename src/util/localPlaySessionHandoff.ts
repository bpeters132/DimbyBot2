import type { Player } from "lavalink-client"
import {
    acquirePlayerSessionClearSuppressLease,
    clearPlayerSession,
    flushPlayerSessionSave,
    schedulePlayerSessionSave,
    type PlayerSessionClearSuppressLease,
} from "./playerSessionPersistence.js"

/**
 * Session policy for Lavalink → @discordjs/voice local playback handoff.
 *
 * Destroying Lavalink fires `playerDestroy` → `clearPlayerSession`. Without a suppress
 * lease, a failed local VC join after destroy permanently deletes the persisted queue.
 * Hold a suppress lease across destroy, then clear only after local Ready succeeds.
 */
export type LocalPlaySessionHandoff = {
    /** True when Lavalink destroy was attempted successfully (player torn down). */
    readonly destroyedLavalink: boolean
    /**
     * Call after `playerDestroy` is observed (or known to have run). When true, the
     * suppress lease was consumed by the skipped clear; do not release again.
     */
    markDestroyEventSeen(): void
    /** Release a leftover lease if destroy never emitted `playerDestroy` (avoid leak). */
    releaseLeftoverSuppressLease(): void
    /** Intentional clear after local playback has started successfully. */
    clearSessionAfterLocalReady(): Promise<void>
}

/**
 * Flushes the live snapshot, acquires a suppress lease, then runs `destroyLavalink`.
 * On destroy failure the lease is released immediately.
 */
export async function beginLocalPlaySessionHandoff(
    player: Player,
    destroyLavalink: () => Promise<void>
): Promise<LocalPlaySessionHandoff> {
    const guildId = player.guildId
    schedulePlayerSessionSave(player)
    await flushPlayerSessionSave(guildId)

    let lease: PlayerSessionClearSuppressLease | null =
        acquirePlayerSessionClearSuppressLease(guildId)
    let destroyEventSeen = false
    let destroyedLavalink = false

    try {
        await destroyLavalink()
        destroyedLavalink = true
    } catch {
        lease.release()
        lease = null
    }

    return {
        get destroyedLavalink() {
            return destroyedLavalink
        },
        markDestroyEventSeen() {
            destroyEventSeen = true
        },
        releaseLeftoverSuppressLease() {
            if (!lease || destroyEventSeen) return
            lease.release()
            lease = null
        },
        async clearSessionAfterLocalReady() {
            // If playerDestroy never consumed the lease, release so clear can delete.
            if (lease && !destroyEventSeen) {
                lease.release()
                lease = null
            }
            if (!destroyedLavalink) return
            await clearPlayerSession(guildId)
        },
    }
}
