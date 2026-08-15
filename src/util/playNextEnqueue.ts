import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import {
    isRRQActive,
    rebalancePlayerQueueRoundRobinAssumingLock,
    stampRequesterUserIdOnTracks,
} from "./rrqDisconnect.js"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { schedulePlayerSessionSave } from "./playerSessionPersistence.js"

/**
 * Enqueues a track at the front of the *live* guild player under the shared queue lock.
 * Callers must re-resolve via `getLivePlayer` so a destroy during an earlier search cannot
 * append onto a stale Player that is no longer in the Lavalink manager map.
 */
export async function enqueuePlayNextTrackAssumingSearchDone(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    track: Track | UnresolvedTrack,
    requesterId: string
): Promise<"ok" | "no_player"> {
    stampRequesterUserIdOnTracks([track], requesterId)
    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return "no_player"
        live.queue.add(track, 0)
        if (isRRQActive(live)) {
            await rebalancePlayerQueueRoundRobinAssumingLock(live)
        }
        schedulePlayerSessionSave(live)
        return "ok"
    })
}
