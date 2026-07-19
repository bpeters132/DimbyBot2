import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { PersistedQueueTrack } from "../types/index.js"
import { getRequesterUserId, stampRequesterUserIdOnTracks } from "./rrqDisconnect.js"
import { thumbnailFromLavalinkTrack } from "./trackThumbnail.js"

const RESOLVE_CONCURRENCY = 6

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

function normalizeUriForCompare(uri: string): string {
    return uri.trim().toLowerCase().replace(/\/+$/, "")
}

/** True when a resolved Lavalink track matches what we persisted (guards bad search hits). */
function trackMatchesStored(track: Track, stored: PersistedQueueTrack): boolean {
    const resolvedUri = track.info.uri?.trim()
    const storedUri = stored.uri.trim()
    if (resolvedUri && storedUri) {
        if (normalizeUriForCompare(resolvedUri) === normalizeUriForCompare(storedUri)) {
            return true
        }
    }
    const resolvedTitle = track.info.title?.trim().toLowerCase()
    const storedTitle = stored.title.trim().toLowerCase()
    return Boolean(resolvedTitle && storedTitle && resolvedTitle === storedTitle)
}

async function resolvePersistedTrackAtIndex(
    player: Player,
    stored: PersistedQueueTrack
): Promise<{ track: Track | null; transientFailure: boolean }> {
    const requester = stored.requesterId ?? "session-restore"
    let sawTransientFailure = false

    if (stored.encoded) {
        try {
            const decoded = await player.node.decode.singleTrack(stored.encoded, requester)
            if (isResolvedTrack(decoded)) {
                if (stored.requesterId) {
                    stampRequesterUserIdOnTracks([decoded], stored.requesterId)
                }
                return { track: decoded, transientFailure: false }
            }
        } catch {
            sawTransientFailure = true
            /* fall through to URI search */
        }
    }

    if (stored.uri) {
        try {
            const res = await player.search(stored.uri, requester)
            const first = res?.tracks?.[0]
            if (isResolvedTrack(first) && trackMatchesStored(first, stored)) {
                if (stored.requesterId) {
                    stampRequesterUserIdOnTracks([first], stored.requesterId)
                }
                return { track: first, transientFailure: false }
            }
            // Search completed but no usable match — permanent for this snapshot.
            return { track: null, transientFailure: false }
        } catch {
            return { track: null, transientFailure: true }
        }
    }

    // Encoded-only track whose decode threw, with no URI fallback.
    return { track: null, transientFailure: sawTransientFailure }
}

/** Resolves persisted tracks via Lavalink (parallel, preserves order). */
export async function resolvePersistedTracks(
    player: Player,
    storedTracks: PersistedQueueTrack[]
): Promise<{ resolved: Track[]; failed: number; transientFailures: number }> {
    if (storedTracks.length === 0) {
        return { resolved: [], failed: 0, transientFailures: 0 }
    }

    const slots: (Track | null)[] = new Array(storedTracks.length).fill(null)
    let nextIndex = 0
    let transientFailures = 0

    async function worker(): Promise<void> {
        while (true) {
            const i = nextIndex++
            if (i >= storedTracks.length) return
            const outcome = await resolvePersistedTrackAtIndex(player, storedTracks[i]!)
            slots[i] = outcome.track
            if (!outcome.track && outcome.transientFailure) {
                transientFailures += 1
            }
        }
    }

    const workerCount = Math.min(RESOLVE_CONCURRENCY, storedTracks.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    const resolved: Track[] = []
    for (const track of slots) {
        if (track) resolved.push(track)
    }
    return { resolved, failed: storedTracks.length - resolved.length, transientFailures }
}
