import { createGuildAsyncChain } from "./guildAsyncChain.js"

const withGuildPlayerQueueChain = createGuildAsyncChain()

/** In-flight search/enqueue (and similar) reservations — orphan cleanup must not destroy while >0 others. */
const guildPlayerLifecycleReservations = new Map<string, number>()

/** Orphan destroy deferred because other lifecycle reservations were still held. */
type PendingOrphanDestroy = {
    hasQueueContent: () => boolean
    destroyPlayer: () => Promise<void>
}

const pendingOrphanDestroyByGuild = new Map<string, PendingOrphanDestroy>()
const pendingOrphanDestroyRunsByGuild = new Map<string, Promise<void>>()

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
            if (next <= 0) {
                guildPlayerLifecycleReservations.delete(guildId)
                // Creator cleanup may have deferred while we (or others) were still reserved.
                const run = runPendingOrphanDestroy(guildId).catch(() => undefined)
                pendingOrphanDestroyRunsByGuild.set(guildId, run)
            } else {
                guildPlayerLifecycleReservations.set(guildId, next)
            }
        },
    }
}

/** Active lifecycle reservations for a guild (includes the calling request while it holds one). */
export function getGuildPlayerLifecycleReservationCount(guildId: string): number {
    return guildPlayerLifecycleReservations.get(guildId) ?? 0
}

/**
 * Destroys an empty orphan player when safe. If other lifecycle reservations are held,
 * records a pending cleanup and retries under the queue lock when the count reaches zero.
 */
export async function tryDestroyOrphanGuildPlayer(
    guildId: string,
    hooks: PendingOrphanDestroy
): Promise<void> {
    await withGuildPlayerQueueLock(guildId, async () => {
        if (hooks.hasQueueContent()) {
            pendingOrphanDestroyByGuild.delete(guildId)
            return
        }
        // Count includes the caller; >1 means another in-flight request still needs the player.
        if (getGuildPlayerLifecycleReservationCount(guildId) > 1) {
            pendingOrphanDestroyByGuild.set(guildId, hooks)
            return
        }
        pendingOrphanDestroyByGuild.delete(guildId)
        await hooks.destroyPlayer()
    })
}

async function runPendingOrphanDestroy(guildId: string): Promise<void> {
    const hooks = pendingOrphanDestroyByGuild.get(guildId)
    if (!hooks) return

    await withGuildPlayerQueueLock(guildId, async () => {
        const pending = pendingOrphanDestroyByGuild.get(guildId)
        if (!pending) return
        // A new reservation may have landed between release and acquiring the queue lock.
        if (getGuildPlayerLifecycleReservationCount(guildId) > 0) return
        if (pending.hasQueueContent()) {
            pendingOrphanDestroyByGuild.delete(guildId)
            return
        }
        pendingOrphanDestroyByGuild.delete(guildId)
        await pending.destroyPlayer()
    })
}

/** Test-only: await the deferred orphan-destroy run kicked off by the last reservation release. */
export function waitForPendingOrphanDestroyForTests(guildId: string): Promise<void> {
    return pendingOrphanDestroyRunsByGuild.get(guildId) ?? Promise.resolve()
}

/** Test-only: whether a deferred orphan destroy is recorded for the guild. */
export function hasPendingOrphanDestroyForTests(guildId: string): boolean {
    return pendingOrphanDestroyByGuild.has(guildId)
}
