import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import { stampRequesterUserIdOnTracks } from "../../util/rrqDisconnect.js"
import { withGuildPlayerQueueLock } from "../../util/guildPlayerQueueLock.js"
import { startPlaybackIfNeeded } from "../../util/musicManager.js"
import { schedulePlayerSessionSave } from "../../util/playerSessionPersistence.js"
import { isPlaylistLoadType, schedulePrefetchWindow } from "../../util/youtubePlaybackWindow.js"

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
 * YouTube playback is prepared just-in-time (current + prefetch window), not for the whole list.
 */
export async function enqueueSearchTracksAssumingSearchDone(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    searchResult: SearchTracksEnqueuePayload,
    requesterId: string
): Promise<EnqueueSearchTracksResult> {
    const liveForEnqueue = getLivePlayer()
    if (!liveForEnqueue) return { status: "no_player" }

    const isPlaylist = isPlaylistLoadType(searchResult.loadType)
    const tracksToEnqueue = isPlaylist ? searchResult.tracks : [searchResult.tracks[0]!]
    if (tracksToEnqueue.length === 0 || !tracksToEnqueue[0]) {
        throw new Error("None of the playlist tracks could be prepared for playback.")
    }
    stampRequesterUserIdOnTracks(tracksToEnqueue, requesterId)

    const locked = await withGuildPlayerQueueLock(guildId, async () => {
        const live = getLivePlayer()
        if (!live) return { status: "no_player" as const }

        if (isPlaylist) {
            live.queue.add(tracksToEnqueue)
        } else {
            live.queue.add(tracksToEnqueue[0]!)
        }
        return { status: "ok" as const, player: live, wasPlaying: live.playing }
    })
    if (locked.status === "no_player") return locked

    const liveAfter = getLivePlayer()
    if (!liveAfter) return { status: "no_player" }

    try {
        await startPlaybackIfNeeded(liveAfter)
        schedulePrefetchWindow(getLivePlayer, guildId)
        schedulePlayerSessionSave(liveAfter)
        return {
            status: "ok",
            player: liveAfter,
            playbackStarted: !locked.wasPlaying,
        }
    } catch (error: unknown) {
        const playbackError = error instanceof Error ? error.message : String(error)
        schedulePlayerSessionSave(liveAfter)
        return {
            status: "ok",
            player: liveAfter,
            playbackStarted: false,
            playbackError,
        }
    }
}
