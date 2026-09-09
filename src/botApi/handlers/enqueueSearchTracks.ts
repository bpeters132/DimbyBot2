import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import { stampRequesterUserIdOnTracks } from "../../util/rrqDisconnect.js"
import { withGuildPlayerQueueLock } from "../../util/guildPlayerQueueLock.js"
import { startPlaybackIfNeeded } from "../../util/startPlaybackIfNeeded.js"
import { scheduleSaveIfPlayerStillLive } from "../../util/playerSessionPersistence.js"
import { isSpotifyCatalogTrack, isYoutubeSourceTrack } from "../../util/youtubeCompanionPlayback.js"
import { isPlaylistLoadType, schedulePrefetchWindow } from "../../util/youtubePlaybackWindow.js"

function canEnqueueSearchTrack(track: Track | UnresolvedTrack): boolean {
    const uri = track.info?.uri
    if (typeof uri === "string" && uri.trim().length > 0) return true
    return isYoutubeSourceTrack(track) || isSpotifyCatalogTrack(track)
}

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
    const candidates = isPlaylist ? searchResult.tracks : searchResult.tracks.slice(0, 1)
    const tracksToEnqueue = candidates.filter(canEnqueueSearchTrack)
    if (tracksToEnqueue.length === 0 || !tracksToEnqueue[0]) {
        throw new Error("None of the playlist tracks could be prepared for playback.")
    }
    stampRequesterUserIdOnTracks(tracksToEnqueue, requesterId)

    const locked = await withGuildPlayerQueueLock(guildId, async () => {
        // Companion resolve can outlive /stop + a successor createPlayer. Existence-only
        // re-resolve would enqueue onto the new session and pollute its queue/snapshot.
        const live = getLivePlayer()
        if (!live || live !== liveForEnqueue) return { status: "no_player" as const }

        if (isPlaylist) {
            live.queue.add(tracksToEnqueue)
        } else {
            live.queue.add(tracksToEnqueue[0]!)
        }
        return { status: "ok" as const, player: live, wasPlaying: live.playing }
    })
    if (locked.status === "no_player") return locked

    const liveAfter = getLivePlayer()
    if (!liveAfter || liveAfter !== locked.player) return { status: "no_player" }

    try {
        const started = await startPlaybackIfNeeded(liveAfter)
        if (getLivePlayer() !== liveAfter) return { status: "no_player" }
        schedulePrefetchWindow(getLivePlayer, guildId)
        scheduleSaveIfPlayerStillLive(getLivePlayer, liveAfter)
        return {
            status: "ok",
            player: liveAfter,
            playbackStarted: !locked.wasPlaying && (liveAfter.playing || started === "ok"),
        }
    } catch (error: unknown) {
        if (getLivePlayer() !== liveAfter) return { status: "no_player" }
        const playbackError = error instanceof Error ? error.message : String(error)
        scheduleSaveIfPlayerStillLive(getLivePlayer, liveAfter)
        return {
            status: "ok",
            player: liveAfter,
            playbackStarted: false,
            playbackError,
        }
    }
}
