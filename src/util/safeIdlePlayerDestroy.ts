import {
    tryDestroyOrphanGuildPlayer,
    type PendingOrphanDestroy,
} from "./guildPlayerQueueLock.js"

/**
 * Reservation-aware idle/orphan destroy that never rejects to the caller.
 * Lavalink `destroy()` can throw when the node is already unhealthy — the same conditions that
 * often trigger `trackError` / post-`queueEnd` idle teardown. Uncaught rejections from async
 * Lavalink listeners or `setTimeout` fire-and-forget work take down the Node process.
 */
export async function safeIdlePlayerDestroy(
    guildId: string,
    hooks: PendingOrphanDestroy,
    onError: (err: unknown) => void
): Promise<void> {
    try {
        await tryDestroyOrphanGuildPlayer(guildId, hooks, 0)
    } catch (err: unknown) {
        onError(err)
    }
}
