import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import {
    isRRQActive,
    rebalancePlayerQueueRoundRobinAssumingLock,
    stampRequesterUserIdOnTracks,
} from "./rrqDisconnect.js"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
export { scheduleSaveIfPlayerStillLive } from "./playerSessionPersistence.js"

export type MusicManagerEnqueuePayload = {
    isPlaylist: boolean
    tracks: Array<Track | UnresolvedTrack>
    playlistName?: string | null
}

export type MusicManagerEnqueueResult =
    | {
          status: "ok"
          player: Player
          feedbackText: string
      }
    | { status: "no_player" }

/**
 * Enqueues Discord /play (and related) search results onto the *live* guild player under
 * the shared queue lock. Callers must re-resolve via `getLivePlayer` so a destroy during
 * search/connect (/stop, Leave, control/web stop) cannot mutate a stale Player and
 * resurrect its session via schedulePlayerSessionSave.
 *
 * Playback start stays with the caller (outside this lock) so trackError → idle destroy
 * cannot nest on the non-reentrant guild chain.
 */
export async function enqueueMusicManagerTracksAssumingSearchDone(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    payload: MusicManagerEnqueuePayload,
    requesterId: string
): Promise<MusicManagerEnqueueResult> {
    const primary = payload.tracks[0]
    if (!primary) return { status: "no_player" }

    return withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return { status: "no_player" }

        if (payload.isPlaylist && payload.tracks.length > 0) {
            stampRequesterUserIdOnTracks(payload.tracks, requesterId)
            await live.queue.add(payload.tracks)
        } else {
            stampRequesterUserIdOnTracks([primary], requesterId)
            await live.queue.add(primary)
        }

        if (isRRQActive(live)) {
            await rebalancePlayerQueueRoundRobinAssumingLock(live)
        }

        const feedbackText =
            payload.isPlaylist && payload.tracks.length > 0
                ? `Added playlist **${payload.playlistName ?? "Unknown Playlist"}** (${payload.tracks.length} songs) to the queue.`
                : `Added [${primary.info.title}](${primary.info.uri}) to the queue.`

        return { status: "ok", player: live, feedbackText }
    })
}
