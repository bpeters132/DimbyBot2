import type { Player } from "lavalink-client"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import {
    forceClearPlayerSession,
    scheduleSaveIfPlayerStillLive,
    snapshotFromPlayer,
} from "./playerSessionPersistence.js"

export type ClearUpcomingResult = number | "stale"
export type ShuffleUpcomingResult = boolean | "stale"

/**
 * True when an intentional upcoming clear left nothing {@link snapshotFromPlayer} can
 * persist. A debounced save would no-op on that null snapshot and leave the prior DB
 * row in place — restore would resurrect the cleared queue.
 */
export function shouldForceClearSessionAfterUpcomingCleared(player: Player): boolean {
    return snapshotFromPlayer(player) === null
}

/**
 * Persist after an upcoming mutation on `expected`. Empty current+upcoming cannot be
 * written ({@link writePlayerSession} refuses null snapshots), so force-clear the row.
 * No-ops when a successor already owns the guild slot.
 */
export async function persistLiveQueueAfterUpcomingMutation(
    getLivePlayer: () => Player | undefined,
    expected: Player,
    guildId: string
): Promise<void> {
    if (getLivePlayer() !== expected) return
    if (shouldForceClearSessionAfterUpcomingCleared(expected)) {
        await forceClearPlayerSession(guildId)
        return
    }
    scheduleSaveIfPlayerStillLive(getLivePlayer, expected)
}

/**
 * Clears upcoming tracks on the *live* guild player under the shared queue lock.
 * Re-resolves via `getLivePlayer` so a concurrent /stop (or Leave / web stop) cannot
 * splice a destroyed Player and schedulePlayerSessionSave a resurrected session.
 * When `expectedPlayer` is set, refuse if the live instance is a successor.
 *
 * When clear leaves no current track and no upcoming, force-clears the session row:
 * {@link writePlayerSession} refuses null snapshots (transient empty-queue guard), so a
 * plain scheduleSave cannot record the clear.
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
        await persistLiveQueueAfterUpcomingMutation(getLivePlayer, live, guildId)
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
