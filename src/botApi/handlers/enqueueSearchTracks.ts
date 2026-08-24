import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import { stampRequesterUserIdOnTracks } from "../../util/rrqDisconnect.js"
import { withGuildPlayerQueueLock } from "../../util/guildPlayerQueueLock.js"
import { startPlaybackIfNeeded } from "../../util/musicManager.js"
import { schedulePlayerSessionSave } from "../../util/playerSessionPersistence.js"
import { tryGetBotClient } from "../../lib/botClientRegistry.js"
import {
    companionPlaybackConfig,
    resolveYoutubePlaybackTrack,
    resolveYoutubePlaybackTracks,
} from "../../util/youtubeCompanionPlayback.js"

export type EnqueueSearchTracksResult =
    | { status: "ok"; player: Player; playbackStarted: boolean; playbackError?: string }
    | { status: "no_player" }

export type SearchTracksEnqueuePayload = {
    loadType: string
    tracks: Array<Track | UnresolvedTrack>
}

/**
 * Enqueues search results onto the *live* guild player under the shared queue lock.
 * Callers must re-resolve via `getLivePlayer` so a destroy during an earlier search
 * (/stop, Leave, control/web stop) cannot mutate a stale Player and resurrect its session.
 * After companion resolve, also requires the same Player identity (not merely a successor).
 */
export async function enqueueSearchTracksAssumingSearchDone(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    searchResult: SearchTracksEnqueuePayload,
    requesterId: string
): Promise<EnqueueSearchTracksResult> {
    const liveForResolve = getLivePlayer()
    if (!liveForResolve) return { status: "no_player" }

    const tracksToEnqueue =
        searchResult.loadType === "playlist" ? searchResult.tracks : [searchResult.tracks[0]!]
    stampRequesterUserIdOnTracks(tracksToEnqueue, requesterId)
    const isPlaylist = searchResult.loadType === "playlist"
    const playableTracks = isPlaylist
        ? await resolveYoutubePlaybackTracks(
              liveForResolve,
              tracksToEnqueue,
              companionPlaybackConfig(tryGetBotClient() ?? undefined)
          )
        : [
              await resolveYoutubePlaybackTrack(
                  liveForResolve,
                  tracksToEnqueue[0]!,
                  companionPlaybackConfig(tryGetBotClient() ?? undefined)
              ),
          ]
    if (playableTracks.length === 0) {
        throw new Error("None of the playlist tracks could be prepared for playback.")
    }

    return withGuildPlayerQueueLock(guildId, async () => {
        // Companion resolve can outlive /stop + a successor createPlayer. Existence-only
        // re-resolve would enqueue onto the new session and pollute its queue/snapshot.
        const live = getLivePlayer()
        if (!live || live !== liveForResolve) return { status: "no_player" }

        if (isPlaylist) {
            live.queue.add(playableTracks)
        } else {
            live.queue.add(playableTracks[0]!)
        }

        const wasPlaying = live.playing
        try {
            await startPlaybackIfNeeded(live)
            schedulePlayerSessionSave(live)
            return { status: "ok", player: live, playbackStarted: !wasPlaying }
        } catch (error: unknown) {
            const playbackError = error instanceof Error ? error.message : String(error)
            schedulePlayerSessionSave(live)
            return {
                status: "ok",
                player: live,
                playbackStarted: false,
                playbackError,
            }
        }
    })
}
