import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import { stampRequesterUserIdOnTracks } from "../util/rrqDisconnect.js"
import { withGuildPlayerQueueLock } from "../util/guildPlayerQueueLock.js"
import { startPlaybackIfNeeded } from "../util/musicManager.js"
import { schedulePlayerSessionSave } from "../util/playerSessionPersistence.js"

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
 */
export async function enqueueSearchTracksAssumingSearchDone(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    searchResult: SearchTracksEnqueuePayload,
    requesterId: string
): Promise<EnqueueSearchTracksResult> {
    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return { status: "no_player" }

        if (searchResult.loadType === "playlist") {
            stampRequesterUserIdOnTracks(searchResult.tracks, requesterId)
            live.queue.add(searchResult.tracks)
        } else {
            stampRequesterUserIdOnTracks([searchResult.tracks[0]!], requesterId)
            live.queue.add(searchResult.tracks[0]!)
        }

        try {
            await startPlaybackIfNeeded(live)
            schedulePlayerSessionSave(live)
            return { status: "ok", player: live, playbackStarted: true }
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
