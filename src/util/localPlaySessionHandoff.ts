import type { Player } from "lavalink-client"
import {
    acquirePlayerSessionClearSuppressLease,
    clearPlayerSession,
    flushPlayerSessionSave,
    schedulePlayerSessionSave,
    shouldSkipPlayerSessionClear,
    type PlayerSessionClearSuppressLease,
} from "./playerSessionPersistence.js"

/**
 * Session policy for Lavalink → @discordjs/voice local playback handoff.
 *
 * Destroying Lavalink fires `playerDestroy` → `clearPlayerSession`. Without a suppress
 * lease, a failed local VC join after destroy permanently deletes the persisted queue.
 * Hold a suppress lease across destroy (and across destroy *failure*), then clear only
 * after local Ready succeeds.
 *
 * Callers must not mutate the live queue (e.g. `stopPlaying(true)`) before this runs —
 * the flush below captures `player.queue` as-is.
 *
 * `stopPlaying(true)` inside the destroy callback clears the live queue and typically
 * emits `queueEnd`, which schedules an idle destroy ~5s later. If handoff destroy throws
 * and the lease were released immediately, that idle path would wipe the flushed snapshot
 * while local join is still in flight — keep the lease until Ready/join-fail cleanup.
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
 * True when this handoff still owns an active suppress lease that must not be
 * double-released (playerDestroy may have consumed it without markDestroyEventSeen).
 */
function handoffLeaseStillHeld(guildId: string, destroyEventSeen: boolean): boolean {
    return !destroyEventSeen && shouldSkipPlayerSessionClear(guildId)
}

/**
 * Flushes the live snapshot, acquires a suppress lease, then runs `destroyLavalink`.
 * On destroy failure the lease is kept so queueEnd idle teardown cannot wipe the flush.
 *
 * `destroyLavalink` may clear/stop the player — do that only inside the callback so the
 * flushed snapshot still includes upcoming tracks.
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
        // Keep lease: stopPlaying in the callback often schedules queueEnd idle destroy.
        destroyedLavalink = false
    }

    return {
        get destroyedLavalink() {
            return destroyedLavalink
        },
        markDestroyEventSeen() {
            destroyEventSeen = true
        },
        releaseLeftoverSuppressLease() {
            if (!lease) return
            if (handoffLeaseStillHeld(guildId, destroyEventSeen)) {
                lease.release()
            }
            lease = null
        },
        async clearSessionAfterLocalReady() {
            // If playerDestroy never consumed the lease, release so clear can delete.
            // If idle destroy already consumed it, do not double-release.
            if (lease) {
                if (handoffLeaseStillHeld(guildId, destroyEventSeen)) {
                    lease.release()
                }
                lease = null
            }
            await clearPlayerSession(guildId)
        },
    }
}
