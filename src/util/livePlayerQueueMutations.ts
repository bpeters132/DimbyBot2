import type { Player } from "lavalink-client"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import {
    clearPlayerSessionPreservePriorSnapshot,
    scheduleSaveIfPlayerStillLive,
} from "./playerSessionPersistence.js"

export type ClearUpcomingResult = number | "stale"
export type ShuffleUpcomingResult = boolean | "stale"

/**
 * Clears upcoming tracks on the *live* guild player under the shared queue lock.
 * Re-resolves via `getLivePlayer` so a concurrent /stop (or Leave / web stop) cannot
 * splice a destroyed Player and schedulePlayerSessionSave a resurrected session.
 * When `expectedPlayer` is set, refuse if the live instance is a successor.
 *
 * Releases preserve-prior before scheduling a save: after a partial/concurrent restore
 * that guard blocks all writes, so an intentional `/clearqueue` or dashboard clear would
 * leave the fuller DB row in place and resurrect the cleared upcoming on the next restore.
 */
export async function clearUpcomingOnLivePlayer(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    expectedPlayer?: Player
): Promise<ClearUpcomingResult> {
    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return expectedPlayer ? ("stale" as const) : 0
        if (expectedPlayer && live !== expectedPlayer) return "stale"
        const size = live.queue.tracks.length
        if (size === 0) return 0
        await live.queue.splice(0, size)
        // User cleared upcoming — the live queue is now the source of truth, including
        // abandoning unrestored tracks still held only in a preserve-prior DB row.
        clearPlayerSessionPreservePriorSnapshot(guildId)
        scheduleSaveIfPlayerStillLive(getLivePlayer, live)
        return size
    })
}

/**
 * Shuffles upcoming tracks on the *live* guild player under the shared queue lock.
 * Same destroy-during-wait guard as {@link clearUpcomingOnLivePlayer}.
 */
export async function shuffleUpcomingOnLivePlayer(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    expectedPlayer?: Player
): Promise<ShuffleUpcomingResult> {
    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return expectedPlayer ? ("stale" as const) : false
        if (expectedPlayer && live !== expectedPlayer) return "stale"
        if (live.queue.tracks.length < 2) return false
        await live.queue.shuffle()
        scheduleSaveIfPlayerStillLive(getLivePlayer, live)
        return true
    })
}
