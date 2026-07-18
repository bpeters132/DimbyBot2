import { createGuildAsyncChain } from "./guildAsyncChain.js"

const withGuildPlayerQueueChain = createGuildAsyncChain()

/** In-flight search/enqueue (and similar) reservations — orphan cleanup must not destroy while >0 others. */
const guildPlayerLifecycleReservations = new Map<string, number>()

/** Runs `work` after prior guild queue mutations finish (completion order matches request order). */
export function withGuildPlayerQueueLock<T>(guildId: string, work: () => Promise<T>): Promise<T> {
    return withGuildPlayerQueueChain(guildId, work)
}

/**
 * Reserves the guild player for one request from acquisition through search/enqueue.
 * Orphan cleanup should skip destroy while more than one reservation is held.
 */
export function acquireGuildPlayerLifecycleReservation(guildId: string): { release(): void } {
    guildPlayerLifecycleReservations.set(
        guildId,
        (guildPlayerLifecycleReservations.get(guildId) ?? 0) + 1
    )
    let released = false
    return {
        release() {
            if (released) return
            released = true
            const next = (guildPlayerLifecycleReservations.get(guildId) ?? 1) - 1
            if (next <= 0) guildPlayerLifecycleReservations.delete(guildId)
            else guildPlayerLifecycleReservations.set(guildId, next)
        },
    }
}

/** Active lifecycle reservations for a guild (includes the calling request while it holds one). */
export function getGuildPlayerLifecycleReservationCount(guildId: string): number {
    return guildPlayerLifecycleReservations.get(guildId) ?? 0
}
