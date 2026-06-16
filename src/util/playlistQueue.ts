import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { PlaylistTrackData } from "../types/index.js"
import { thumbnailFromLavalinkTrack } from "./trackThumbnail.js"
import {
    isRRQActive,
    rebalancePlayerQueueRoundRobin,
    stampRequesterUserIdOnTracks,
} from "./rrqDisconnect.js"
import { startPlaybackIfNeeded } from "./musicManager.js"
import { schedulePlayerSessionSave } from "./playerSessionPersistence.js"

export function shuffleArray<T>(items: T[]): T[] {
    const arr = [...items]
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = arr[i]
        arr[i] = arr[j]!
        arr[j] = tmp!
    }
    return arr
}

function isResolvedTrack(track: unknown): track is Track {
    return (
        Boolean(track) &&
        typeof track === "object" &&
        "info" in track &&
        typeof (track as Track).info?.uri === "string"
    )
}

/** Parallel Lavalink lookups when loading saved playlists into the queue. */
const PLAYLIST_RESOLVE_CONCURRENCY = 6

async function resolveStoredTrackAtIndex(
    player: Player,
    uri: string,
    requester: unknown
): Promise<Track | null> {
    try {
        const res = await player.search(uri, requester)
        const first = res?.tracks?.[0]
        return isResolvedTrack(first) ? first : null
    } catch {
        return null
    }
}

/** Resolves stored playlist URIs via Lavalink (parallel, preserves track order). */
export async function resolveStoredPlaylistTracks(
    player: Player,
    storedTracks: Pick<PlaylistTrackData, "uri">[],
    requester: unknown
): Promise<{ resolved: Track[]; failed: number }> {
    if (storedTracks.length === 0) {
        return { resolved: [], failed: 0 }
    }

    const slots: (Track | null)[] = new Array(storedTracks.length).fill(null)
    let nextIndex = 0

    async function worker(): Promise<void> {
        while (true) {
            const i = nextIndex++
            if (i >= storedTracks.length) return
            slots[i] = await resolveStoredTrackAtIndex(player, storedTracks[i]!.uri, requester)
        }
    }

    const workerCount = Math.min(PLAYLIST_RESOLVE_CONCURRENCY, storedTracks.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    const resolved: Track[] = []
    for (const track of slots) {
        if (track) resolved.push(track)
    }
    return { resolved, failed: storedTracks.length - resolved.length }
}

export type EnqueuePlaylistResult = {
    queued: number
    failed: number
    playbackStarted: boolean
    playbackError?: string
}

/** Snapshot of upcoming queue tracks (excludes the current track if playing). */
export function snapshotUpcomingQueue(player: Player): Array<Track | UnresolvedTrack> {
    return [...player.queue.tracks]
}

/** Restores a prior upcoming-queue snapshot after a failed replace (best-effort). */
export async function restoreUpcomingQueue(
    player: Player,
    tracks: Array<Track | UnresolvedTrack>
): Promise<void> {
    await clearUpcomingQueue(player)
    if (tracks.length > 0) {
        await player.queue.splice(0, 0, tracks)
    }
}

/** Removes all upcoming tracks (keeps current if playing). */
export async function clearUpcomingQueue(player: Player): Promise<void> {
    const size = player.queue.tracks.length
    if (size > 0) {
        await player.queue.splice(0, size)
    }
}

/** Adds resolved tracks to the player queue and starts playback when idle. */
export async function enqueueResolvedPlaylistTracks(
    player: Player,
    tracks: Track[],
    requesterId: string,
    shuffle: boolean
): Promise<EnqueuePlaylistResult> {
    if (tracks.length === 0) {
        return { queued: 0, failed: 0, playbackStarted: false }
    }
    const toQueue = shuffle ? shuffleArray(tracks) : tracks
    stampRequesterUserIdOnTracks(toQueue, requesterId)
    player.queue.add(toQueue)
    if (isRRQActive(player)) {
        await rebalancePlayerQueueRoundRobin(player)
    }
    let playbackStarted = false
    let playbackError: string | undefined
    if (!player.playing) {
        try {
            await startPlaybackIfNeeded(player)
            playbackStarted = true
        } catch (error: unknown) {
            playbackError = error instanceof Error ? error.message : String(error)
        }
    }
    schedulePlayerSessionSave(player)
    return {
        queued: toQueue.length,
        failed: 0,
        playbackStarted,
        playbackError,
    }
}

export type PlaylistTrackSearchHit = {
    title: string
    uri: string
    author: string
    duration: number
    thumbnailUrl: string | null
}

function isExternalPlaylistLoadType(loadType: string | undefined): boolean {
    return loadType === "playlist" || loadType === "PLAYLIST_LOADED"
}

function trackToSearchHit(track: Track, fallbackUri: string): PlaylistTrackSearchHit {
    const info = track.info
    return {
        title: info.title ?? "Unknown",
        uri: info.uri ?? fallbackUri,
        author: info.author ?? "Unknown",
        duration: info.duration ?? 0,
        thumbnailUrl: thumbnailFromLavalinkTrack(track),
    }
}

/** Lavalink/search threw; distinct from empty or unresolvable results. */
export const PLAYLIST_SEARCH_TRANSIENT_ERROR = "Search failed."

/** True when callers should retry (5xx), not treat as a missing track (404). */
export function isPlaylistSearchTransientFailure(error: string): boolean {
    return error === PLAYLIST_SEARCH_TRANSIENT_ERROR
}

/** Resolves a query or URL to one or more tracks for saving in a user playlist. */
export async function searchTracksForPlaylist(
    player: Player,
    query: string,
    requester: unknown
): Promise<{ ok: true; tracks: PlaylistTrackSearchHit[] } | { ok: false; error: string }> {
    const trimmed = query.trim()
    if (!trimmed) {
        return { ok: false, error: "Enter a search query or URL." }
    }
    let res
    try {
        res = await player.search(trimmed, requester)
    } catch {
        return { ok: false, error: PLAYLIST_SEARCH_TRANSIENT_ERROR }
    }
    if (!res?.tracks?.length) {
        return { ok: false, error: "No tracks found." }
    }

    if (isExternalPlaylistLoadType(res.loadType as string | undefined)) {
        const tracks: PlaylistTrackSearchHit[] = []
        for (const candidate of res.tracks) {
            if (isResolvedTrack(candidate)) {
                tracks.push(trackToSearchHit(candidate, trimmed))
            }
        }
        if (tracks.length === 0) {
            return { ok: false, error: "Could not resolve any tracks from that playlist." }
        }
        return { ok: true, tracks }
    }

    const first = res.tracks[0]
    if (!isResolvedTrack(first)) {
        return { ok: false, error: "Could not resolve that track." }
    }
    return { ok: true, tracks: [trackToSearchHit(first, trimmed)] }
}

/** @deprecated Prefer {@link searchTracksForPlaylist}. */
export async function searchTrackForPlaylist(
    player: Player,
    query: string,
    requester: unknown
): Promise<
    | { ok: true; title: string; uri: string; author: string; duration: number }
    | { ok: false; error: string }
> {
    const result = await searchTracksForPlaylist(player, query, requester)
    if (result.ok === false) return result
    return { ok: true, ...result.tracks[0]! }
}

type LavalinkPlayerAccess = {
    getPlayer(guildId: string): Player | undefined
    players: Map<string, Player>
}

/** Prefers the guild player, otherwise any active player (for search-only operations). */
export function pickPlayerForPlaylistSearch(
    lavalink: LavalinkPlayerAccess,
    preferredGuildId?: string
): Player | undefined {
    if (preferredGuildId) {
        const inGuild = lavalink.getPlayer(preferredGuildId)
        if (inGuild) return inGuild
    }
    return lavalink.players.values().next().value
}
