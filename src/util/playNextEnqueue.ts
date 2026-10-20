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
import { playbackStartLostLivePlayer, startPlaybackIfNeeded } from "./startPlaybackIfNeeded.js"
import { schedulePrefetchWindow } from "./youtubePlaybackWindow.js"

/**
 * Enqueues a track at the front of the *live* guild player under the shared queue lock.
 * Callers must re-resolve via `getLivePlayer` so a destroy during an earlier search cannot
 * append onto a stale Player that is no longer in the Lavalink manager map.
 * After companion resolve, also requires the same Player identity (not merely a successor).
 *
 * When the player is idle (nothing playing / no current), starts playback after enqueue —
 * otherwise `/playnext` after queue-end would report success while silence continues and the
 * idle destroy skip (hasQueueContent) leaves the bot stuck with an unplayed upcoming track.
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
    const locked = await withGuildPlayerQueueLock(guildId, async () => {
        // Companion resolve can outlive /stop + successor createPlayer — refuse identity change.
        const live = getLivePlayer()
        if (!live || live !== liveForResolve) return "no_player" as const
        await live.queue.add(playableTrack, 0)
        if (isRRQActive(live)) {
            await rebalancePlayerQueueRoundRobinAssumingLock(live)
        }
        scheduleSaveIfPlayerStillLive(getLivePlayer, live)
        return "ok" as const
    })
    if (locked === "no_player") return "no_player"

    // Start outside the queue lock (same contract as /play and playlist enqueue) so
    // trackError → idle destroy cannot nest on the non-reentrant guild chain.
    const liveAfter = getLivePlayer()
    if (!liveAfter || liveAfter !== liveForResolve) return "no_player"
    if (!liveAfter.playing) {
        try {
            const started = await startPlaybackIfNeeded(liveAfter, getLivePlayer)
            if (playbackStartLostLivePlayer(started) || getLivePlayer() !== liveAfter) {
                return "no_player"
            }
        } catch {
            // Track is already queued; surface enqueue success. Caller may still hear silence
            // until a later play/skip — prefer not to claim the player was replaced.
            if (getLivePlayer() !== liveAfter) return "no_player"
        }
    }
    if (getLivePlayer() !== liveAfter) return "no_player"
    schedulePrefetchWindow(getLivePlayer, guildId)
    scheduleSaveIfPlayerStillLive(getLivePlayer, liveAfter)
    return "ok"
}
