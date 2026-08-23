import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import {
    isRRQActive,
    rebalancePlayerQueueRoundRobinAssumingLock,
    stampRequesterUserIdOnTracks,
} from "./rrqDisconnect.js"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { scheduleSaveIfPlayerStillLive } from "./playerSessionPersistence.js"
import { tryGetBotClient } from "../lib/botClientRegistry.js"
import { companionPlaybackConfig, resolveYoutubePlaybackTrack } from "./youtubeCompanionPlayback.js"

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
    const liveForResolve = getLivePlayer()
    if (!liveForResolve) return "no_player"
    const playableTrack = await resolveYoutubePlaybackTrack(
        liveForResolve,
        track,
        companionPlaybackConfig(tryGetBotClient() ?? undefined)
    )
    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return "no_player"
        await live.queue.add(playableTrack, 0)
        if (isRRQActive(live)) {
            await rebalancePlayerQueueRoundRobinAssumingLock(live)
        }
        scheduleSaveIfPlayerStillLive(getLivePlayer, live)
        return "ok"
    })
}
