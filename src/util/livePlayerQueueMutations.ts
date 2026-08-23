import type { Player } from "lavalink-client"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { scheduleSaveIfPlayerStillLive } from "./playerSessionPersistence.js"

/**
 * Clears upcoming tracks on the *live* guild player under the shared queue lock.
 * Re-resolves via `getLivePlayer` so a concurrent /stop (or Leave / web stop) cannot
 * splice a destroyed Player and schedulePlayerSessionSave a resurrected session.
 */
export async function clearUpcomingOnLivePlayer(
    getLivePlayer: () => Player | undefined,
    guildId: string
): Promise<number> {
    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return 0
        const size = live.queue.tracks.length
        if (size === 0) return 0
        await live.queue.splice(0, size)
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
    guildId: string
): Promise<boolean> {
    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live || live.queue.tracks.length < 2) return false
        await live.queue.shuffle()
        scheduleSaveIfPlayerStillLive(getLivePlayer, live)
        return true
    })
}
