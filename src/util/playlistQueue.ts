import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { PlaylistTrackData } from "../types/index.js"
import { thumbnailFromLavalinkTrack } from "./trackThumbnail.js"
import {
    isRRQActive,
    rebalancePlayerQueueRoundRobinAssumingLock,
    stampRequesterUserIdOnTracks,
} from "./rrqDisconnect.js"
import { startPlaybackIfNeeded } from "./startPlaybackIfNeeded.js"
import { scheduleSaveIfPlayerStillLive } from "./playerSessionPersistence.js"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { isBlockedUserMediaUrl, USER_MEDIA_URL_BLOCKED } from "./userMediaUrl.js"
import {
    isPlaylistLoadType,
    queueMetadataTrackFromFields,
    schedulePrefetchWindow,
} from "./youtubePlaybackWindow.js"

/** True when the player has a current track or upcoming queue entries. */
export function playerHasQueueContent(player: Player): boolean {
    return Boolean(player.queue.current) || player.queue.tracks.length > 0
}

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

/**
 * Turns stored playlist rows into Queue metadata (no Lavalink search).
 * Blocked User media URLs are counted as failed and omitted.
 */
export async function resolveStoredPlaylistTracks(
    _player: Player,
    storedTracks: Pick<
        PlaylistTrackData,
        "uri" | "title" | "author" | "duration" | "thumbnailUrl"
    >[],
    requester: unknown
): Promise<{ resolved: Track[]; failed: number }> {
    if (storedTracks.length === 0) {
        return { resolved: [], failed: 0 }
    }
    const requesterId =
        typeof requester === "object" && requester !== null && "id" in requester
            ? String((requester as { id?: unknown }).id ?? "")
            : typeof requester === "string"
              ? requester
              : ""
    const resolved: Track[] = []
    let failed = 0
    for (const stored of storedTracks) {
        const track = queueMetadataTrackFromFields({
            title: stored.title ?? "Unknown",
            author: stored.author ?? "Unknown",
            uri: stored.uri,
            duration: stored.duration ?? 0,
            thumbnailUrl: stored.thumbnailUrl,
            requesterId: requesterId || null,
        })
        if (track) resolved.push(track)
        else failed += 1
    }
    return { resolved, failed }
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

async function enqueueTracksUnderLock(
    getLivePlayer: () => Player | undefined,
    player: Player,
    tracks: Track[],
    requesterId: string,
    shuffle: boolean
): Promise<EnqueuePlaylistResult> {
    const toQueue = shuffle ? shuffleArray(tracks) : tracks
    stampRequesterUserIdOnTracks(toQueue, requesterId)
    player.queue.add(toQueue)
    if (isRRQActive(player)) {
        // Already holding the guild queue lock -- do not re-enter via rebalancePlayerQueueRoundRobin.
        await rebalancePlayerQueueRoundRobinAssumingLock(player)
    }
    // /stop can destroy during play() even under the queue lock — never save a zombie.
    scheduleSaveIfPlayerStillLive(getLivePlayer, player)
    return {
        queued: toQueue.length,
        failed: 0,
        playbackStarted: false,
    }
}

/** Adds resolved tracks to the *live* guild player under the shared queue lock.
 * After companion resolve, refuses enqueue if a successor replaced the resolve-time Player.
 */
export async function enqueueResolvedPlaylistTracks(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    tracks: Track[],
    requesterId: string,
    shuffle: boolean
): Promise<EnqueuePlaylistResult | "no_player"> {
    if (tracks.length === 0) {
        return { queued: 0, failed: 0, playbackStarted: false }
    }
    return finishPlaylistEnqueue(getLivePlayer, guildId, tracks, requesterId, shuffle, false)
}

/**
 * Atomically replaces the upcoming queue with resolved playlist tracks.
 * Snapshot + clear + enqueue run under one guild lock so a concurrent
 * searchAndEnqueue cannot land between clear and add (silent track loss).
 * Callers must re-resolve via `getLivePlayer` so a destroy during resolve cannot
 * clear/add on a stale Player that is no longer in the Lavalink manager map.
 */
export async function replaceUpcomingWithResolvedPlaylistTracks(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    tracks: Track[],
    requesterId: string,
    shuffle: boolean
): Promise<EnqueuePlaylistResult | "no_player"> {
    if (tracks.length === 0) {
        return { queued: 0, failed: 0, playbackStarted: false }
    }
    return finishPlaylistEnqueue(getLivePlayer, guildId, tracks, requesterId, shuffle, true)
}

async function finishPlaylistEnqueue(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    tracks: Track[],
    requesterId: string,
    shuffle: boolean,
    replaceUpcoming: boolean
): Promise<EnqueuePlaylistResult | "no_player"> {
    const liveForResolve = getLivePlayer()
    if (!liveForResolve) return "no_player"
    const locked = await withGuildPlayerQueueLock(guildId, async () => {
        // Companion resolve can outlive /stop + successor createPlayer — refuse identity change.
        const live = getLivePlayer()
        if (!live || live !== liveForResolve) return "no_player" as const
        if (!replaceUpcoming) {
            return enqueueTracksUnderLock(getLivePlayer, live, tracks, requesterId, shuffle)
        }
        const savedUpcoming = snapshotUpcomingQueue(live)
        try {
            const size = live.queue.tracks.length
            if (size > 0) {
                await live.queue.splice(0, size)
            }
            return await enqueueTracksUnderLock(getLivePlayer, live, tracks, requesterId, shuffle)
        } catch (enqueueErr: unknown) {
            try {
                const size = live.queue.tracks.length
                if (size > 0) {
                    await live.queue.splice(0, size)
                }
                if (savedUpcoming.length > 0) {
                    await live.queue.splice(0, 0, savedUpcoming)
                }
                scheduleSaveIfPlayerStillLive(getLivePlayer, live)
            } catch (restoreErr: unknown) {
                const restoreMessage =
                    restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
                console.error(
                    "[replaceUpcomingWithResolvedPlaylistTracks] failed to restore queue after enqueue error",
                    {
                        guildId,
                        restoreMessage,
                    }
                )
            }
            throw enqueueErr
        }
    })
    if (locked === "no_player") return "no_player"

    const liveAfter = getLivePlayer()
    if (!liveAfter) return "no_player"
    let playbackStarted = locked.playbackStarted
    let playbackError = locked.playbackError
    if (!liveAfter.playing) {
        try {
            const started = await startPlaybackIfNeeded(liveAfter)
            playbackStarted = liveAfter.playing || started === "ok"
        } catch (error: unknown) {
            playbackError = error instanceof Error ? error.message : String(error)
        }
    }
    schedulePrefetchWindow(getLivePlayer, guildId)
    return { ...locked, playbackStarted, playbackError }
}

export type PlaylistTrackSearchHit = {
    title: string
    uri: string
    author: string
    duration: number
    thumbnailUrl: string | null
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
    if (isBlockedUserMediaUrl(trimmed)) {
        return { ok: false, error: USER_MEDIA_URL_BLOCKED }
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

    if (isPlaylistLoadType(res.loadType as string | undefined)) {
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
