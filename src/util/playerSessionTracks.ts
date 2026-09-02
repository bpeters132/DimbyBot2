import type { Track, UnresolvedTrack } from "lavalink-client"
import type { PersistedQueueTrack } from "../types/index.js"
import { getRequesterUserId } from "./rrqDisconnect.js"
import { thumbnailFromLavalinkTrack } from "./trackThumbnail.js"
import { queueMetadataTrackFromFields } from "./youtubePlaybackWindow.js"

function isResolvedTrack(track: unknown): track is Track {
    return (
        Boolean(track) &&
        typeof track === "object" &&
        "info" in track &&
        typeof (track as Track).info?.uri === "string"
    )
}

/** Serializes a Lavalink track into a DB-safe persisted shape. */
export function persistedTrackFromLavalink(
    track: Track | UnresolvedTrack
): PersistedQueueTrack | null {
    const uri = track.info.uri?.trim()
    if (!uri) return null
    const encoded =
        typeof (track as { encoded?: unknown }).encoded === "string"
            ? (track as { encoded: string }).encoded
            : null
    return {
        title: track.info.title?.trim() || "Unknown",
        author: track.info.author?.trim() || "Unknown",
        uri,
        duration: track.info.duration ?? 0,
        encoded,
        requesterId: getRequesterUserId(track.requester),
        thumbnailUrl: isResolvedTrack(track) ? thumbnailFromLavalinkTrack(track) : null,
        isStream: Boolean(track.info.isStream),
    }
}

/**
 * Hydrates persisted session rows as Queue metadata (no Lavalink search or decode).
 * Blocked User media URLs are omitted. YouTube playback is prepared in the prefetch window.
 */
export async function resolvePersistedTracks(
    _player: unknown,
    storedTracks: PersistedQueueTrack[]
): Promise<{ resolved: Track[]; failed: number; transientFailures: number }> {
    if (storedTracks.length === 0) {
        return { resolved: [], failed: 0, transientFailures: 0 }
    }

    const resolved: Track[] = []
    let failed = 0
    for (const stored of storedTracks) {
        const track = queueMetadataTrackFromFields({
            title: stored.title,
            author: stored.author,
            uri: stored.uri,
            duration: stored.duration,
            requesterId: stored.requesterId,
            thumbnailUrl: stored.thumbnailUrl,
            isStream: stored.isStream,
        })
        if (track) resolved.push(track)
        else failed += 1
    }
    return { resolved, failed, transientFailures: 0 }
}
