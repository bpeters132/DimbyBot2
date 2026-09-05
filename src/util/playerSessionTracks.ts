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
        isrc: track.info.isrc?.trim() || null,
    }
}

/** Lowercases http(s) scheme and host only so path/query (YouTube video IDs) stay case-sensitive. */
function normalizeUriForCompare(uri: string): string {
    const trimmed = uri.trim()
    try {
        const parsed = new URL(trimmed)
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            const path = parsed.pathname.replace(/\/+$/, "") || "/"
            return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}${parsed.hash}`
        }
    } catch {
        // Non-URL forms (spotify:track:…) keep their original case aside from trailing slashes.
    }
    return trimmed.replace(/\/+$/, "")
}

/**
 * True when a resolved Lavalink track matches what we persisted (guards bad search hits).
 * Prefer URI equality (scheme/host case-insensitive); otherwise require title, author, and duration.
 */
export function trackMatchesStored(track: Track, stored: PersistedQueueTrack): boolean {
    const resolvedUri = track.info.uri?.trim()
    const storedUri = stored.uri.trim()
    if (resolvedUri && storedUri) {
        if (normalizeUriForCompare(resolvedUri) === normalizeUriForCompare(storedUri)) {
            return true
        }
    }
    const resolvedTitle = track.info.title?.trim().toLowerCase()
    const storedTitle = stored.title.trim().toLowerCase()
    if (!resolvedTitle || !storedTitle || resolvedTitle !== storedTitle) return false
    const resolvedAuthor = (track.info.author ?? "").trim().toLowerCase()
    const storedAuthor = (stored.author ?? "").trim().toLowerCase()
    if (resolvedAuthor !== storedAuthor) return false
    return track.info.duration === stored.duration
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
            isrc: stored.isrc,
        })
        if (track) resolved.push(track)
        else failed += 1
    }
    return { resolved, failed, transientFailures: 0 }
}
