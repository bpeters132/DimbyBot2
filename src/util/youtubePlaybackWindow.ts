import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import { tryGetBotClient } from "../lib/botClientRegistry.js"
import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { loggerFromPartial } from "./loggerFromPartial.js"
import { isBlockedUserMediaUrl } from "./userMediaUrl.js"
import {
    companionPlaybackConfig,
    isCompanionResolvedTrack,
    isSpotifyCatalogTrack,
    isSpotifyCatalogUri,
    isYoutubeSourceTrack,
    resolveYoutubePlaybackTrack,
    youtubeVideoIdFromUri,
    type CompanionPlaybackConfig,
} from "./youtubeCompanionPlayback.js"

/** Upcoming slots after current that belong in the Prefetch window. */
export const PREFETCH_UPCOMING_COUNT = 2

const COMPANION_RETRY_USED_FLAG = "companionErrorRetryUsed"
const LOG_PREFIX = "[YoutubePlaybackWindow]"

export function isPlaylistLoadType(loadType: string | undefined): boolean {
    return loadType === "playlist" || loadType === "PLAYLIST_LOADED"
}

export function queueTrackIdentity(track: Track | UnresolvedTrack): string {
    return (track.info?.uri ?? "").trim().toLowerCase().replace(/\/+$/, "")
}

/**
 * Companion-minted HTTP and native tracks with a non-empty Lavalink `encoded` can play.
 * Queue metadata (`encoded: ""`) is never ready — YouTube/Spotify go through companion
 * prepare; other sources must be hydrated via Lavalink search first.
 */
export function isYoutubePlaybackReady(track: Track | UnresolvedTrack): boolean {
    if (isCompanionResolvedTrack(track)) return true
    if (isSpotifyCatalogTrack(track) || isYoutubeSourceTrack(track)) return false
    const encoded = (track as { encoded?: unknown }).encoded
    return typeof encoded === "string" && encoded.length > 0
}

export function isCompanionRetryUsed(track: Track | UnresolvedTrack): boolean {
    const userData = (track as { userData?: unknown }).userData
    return (
        typeof userData === "object" &&
        userData !== null &&
        (userData as Record<string, unknown>)[COMPANION_RETRY_USED_FLAG] === true
    )
}

export function markCompanionRetryUsed(track: Track | UnresolvedTrack): void {
    const existing = (track as { userData?: unknown }).userData
    const merged: Record<string, unknown> =
        typeof existing === "object" && existing !== null
            ? { ...(existing as Record<string, unknown>) }
            : {}
    merged[COMPANION_RETRY_USED_FLAG] = true
    ;(track as { userData?: unknown }).userData = merged
}

/** Catalog miss / companion playability — skip this item. Network blips are not this. */
export function isPermanentYoutubePlaybackFailure(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err)
    return (
        msg.includes("cannot play") ||
        msg.includes("No YouTube search result") ||
        msg.includes("has no ISRC or title")
    )
}

export type QueueMetadataFields = {
    title: string
    author: string
    uri: string
    duration: number
    requesterId?: string | null
    thumbnailUrl?: string | null
    isStream?: boolean
    isrc?: string | null
}

/**
 * Builds Queue metadata from stored title/author/URI (no Lavalink search).
 * Returns null for blocked User media URLs.
 */
export function queueMetadataTrackFromFields(fields: QueueMetadataFields): Track | null {
    const uri = fields.uri.trim()
    if (!uri || isBlockedUserMediaUrl(uri)) return null
    const youtubeId = youtubeVideoIdFromUri(uri)
    const spotify = isSpotifyCatalogUri(uri)
    const sourceName = youtubeId ? "youtube" : spotify ? "spotify" : "http"
    const identifier = youtubeId ?? (spotify ? spotifyIdentifierFromUri(uri) : uri)
    return {
        encoded: "",
        info: {
            title: fields.title.trim() || "Unknown",
            author: fields.author.trim() || "Unknown",
            uri,
            duration: fields.duration,
            identifier,
            sourceName,
            artworkUrl: fields.thumbnailUrl ?? null,
            isSeekable: true,
            isStream: Boolean(fields.isStream),
            isrc: fields.isrc?.trim() || null,
        },
        requester: fields.requesterId ?? undefined,
        userData: { queueMetadata: true },
    } as unknown as Track
}

function spotifyIdentifierFromUri(uri: string): string {
    const trackMatch = uri.match(/track\/([A-Za-z0-9]+)/)
    if (trackMatch?.[1]) return trackMatch[1]
    if (uri.startsWith("spotify:track:")) return uri.slice("spotify:track:".length)
    return uri
}

function playbackConfig(): CompanionPlaybackConfig | null {
    return companionPlaybackConfig(tryGetBotClient() ?? undefined)
}

function windowLogger(
    config: CompanionPlaybackConfig | null
): ReturnType<typeof loggerFromPartial> {
    return loggerFromPartial(config?.logger)
}

/**
 * Hydrates non-YouTube/Spotify Queue metadata (empty `encoded`) via Lavalink URI search.
 * YouTube/Spotify stay on the companion path in {@link resolveYoutubePlaybackTrack}.
 */
async function hydrateNativeMetadataTrack(
    player: Player,
    track: Track | UnresolvedTrack
): Promise<Track | UnresolvedTrack> {
    const uri = track.info?.uri?.trim() ?? ""
    if (!uri) {
        throw new Error("cannot play track with empty URI")
    }
    if (isBlockedUserMediaUrl(uri)) {
        throw new Error(`cannot play blocked user-media URL: ${uri}`)
    }
    let res: Awaited<ReturnType<Player["search"]>>
    try {
        res = await player.search(uri, track.requester)
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Lavalink search failed for ${uri}: ${msg}`, { cause: err })
    }
    const first = res?.tracks?.[0]
    const encoded =
        first && typeof (first as { encoded?: unknown }).encoded === "string"
            ? (first as { encoded: string }).encoded
            : ""
    if (!first || !encoded) {
        throw new Error(`cannot play: no Lavalink result for ${uri}`)
    }
    if (track.requester != null && (first as { requester?: unknown }).requester == null) {
        ;(first as { requester?: unknown }).requester = track.requester
    }
    return first
}

async function prepareTrack(
    player: Player,
    track: Track | UnresolvedTrack,
    config: CompanionPlaybackConfig | null,
    options?: { force?: boolean }
): Promise<Track | UnresolvedTrack> {
    if (isSpotifyCatalogTrack(track) || isYoutubeSourceTrack(track)) {
        return resolveYoutubePlaybackTrack(player, track, config, options)
    }
    if (!options?.force && isYoutubePlaybackReady(track)) {
        return track
    }
    return hydrateNativeMetadataTrack(player, track)
}

export type PlaybackWindowResult = "ok" | "empty" | "no_player" | "deferred"

function livePlayer(
    getLivePlayer: () => Player | undefined,
    expectedGuildId: string
): Player | undefined {
    const live = getLivePlayer()
    if (!live || live.guildId !== expectedGuildId) return undefined
    return live
}

async function replaceUpcomingAt(
    player: Player,
    index: number,
    expectedIdentity: string,
    replacement: Track | UnresolvedTrack | null
): Promise<boolean> {
    const current = player.queue.tracks[index]
    if (!current || queueTrackIdentity(current) !== expectedIdentity) return false
    if (replacement) {
        await player.queue.splice(index, 1, replacement as Track)
    } else {
        await player.queue.splice(index, 1)
    }
    return true
}

function assignCurrent(player: Player, track: Track | UnresolvedTrack): void {
    player.queue.current = track as Track
}

/**
 * Makes `queue.current` (or upcoming[0] when current is empty) YouTube-playback-ready.
 * Permanently unplayable head items are dropped. Transient resolve failures leave the
 * queue unchanged so a companion/Lavalink blip cannot wipe a playlist.
 */
export async function ensureCurrentPlayable(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    config: CompanionPlaybackConfig | null = playbackConfig()
): Promise<PlaybackWindowResult> {
    const log = windowLogger(config)
    while (true) {
        const snapshot = livePlayer(getLivePlayer, guildId)
        if (!snapshot) return "no_player"
        const head = snapshot.queue.current ?? snapshot.queue.tracks[0]
        if (!head) return "empty"
        if (isYoutubePlaybackReady(head)) return "ok"

        const identity = queueTrackIdentity(head)
        try {
            const resolved = await prepareTrack(snapshot, head, config)
            const applied = await withGuildPlayerQueueLock(guildId, async () => {
                const live = livePlayer(getLivePlayer, guildId)
                if (!live) return "no_player" as const
                if (live.queue.current && queueTrackIdentity(live.queue.current) === identity) {
                    assignCurrent(live, resolved)
                    return "ok" as const
                }
                if (
                    !live.queue.current &&
                    live.queue.tracks[0] &&
                    queueTrackIdentity(live.queue.tracks[0]) === identity
                ) {
                    const replaced = await replaceUpcomingAt(live, 0, identity, resolved)
                    return replaced ? ("ok" as const) : ("continue" as const)
                }
                // Head moved during prepare (skip/shuffle/replace). Re-evaluate the live
                // head — returning "ok" here would let startPlaybackIfNeeded play() an
                // unprepared Queue-metadata track.
                return "continue" as const
            })
            if (applied === "no_player") return "no_player"
            if (applied === "continue") continue
            return "ok"
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!isPermanentYoutubePlaybackFailure(err)) {
                log.warn(`${LOG_PREFIX} deferred current prepare (${identity}): ${msg}`)
                return "deferred"
            }
            log.warn(`${LOG_PREFIX} skipping unplayable current ${identity}: ${msg}`)
            const dropped = await withGuildPlayerQueueLock(guildId, async () => {
                const live = livePlayer(getLivePlayer, guildId)
                if (!live) return "no_player" as const
                if (live.queue.current && queueTrackIdentity(live.queue.current) === identity) {
                    live.queue.current = null
                    return "continue" as const
                }
                if (live.queue.tracks[0] && queueTrackIdentity(live.queue.tracks[0]) === identity) {
                    await replaceUpcomingAt(live, 0, identity, null)
                    return "continue" as const
                }
                return "continue" as const
            })
            if (dropped === "no_player") return "no_player"
        }
    }
}

/**
 * Resolves upcoming[0] (dropping permanent failures) so skip/auto-advance is companion-ready.
 */
export async function ensureUpcomingHeadPlayable(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    config: CompanionPlaybackConfig | null = playbackConfig()
): Promise<PlaybackWindowResult> {
    return ensureUpcomingSlotPlayable(getLivePlayer, guildId, 0, config)
}

async function ensureUpcomingSlotPlayable(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    index: number,
    config: CompanionPlaybackConfig | null
): Promise<PlaybackWindowResult> {
    const log = windowLogger(config)
    while (true) {
        const snapshot = livePlayer(getLivePlayer, guildId)
        if (!snapshot) return "no_player"
        const track = snapshot.queue.tracks[index]
        if (!track) return "empty"
        if (isYoutubePlaybackReady(track)) return "ok"

        const identity = queueTrackIdentity(track)
        try {
            const resolved = await prepareTrack(snapshot, track, config)
            const applied = await withGuildPlayerQueueLock(guildId, async () => {
                const live = livePlayer(getLivePlayer, guildId)
                if (!live) return "no_player" as const
                const replaced = await replaceUpcomingAt(live, index, identity, resolved)
                // Same race as ensureCurrentPlayable: skip/shuffle may have moved this
                // slot. Returning "ok" without a successful replace lets skipCurrentTrack
                // advance onto unprepared Queue metadata.
                return replaced ? ("ok" as const) : ("continue" as const)
            })
            if (applied === "no_player") return "no_player"
            if (applied === "continue") continue
            return "ok"
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!isPermanentYoutubePlaybackFailure(err)) {
                log.warn(`${LOG_PREFIX} deferred upcoming[${index}] (${identity}): ${msg}`)
                return "deferred"
            }
            log.warn(`${LOG_PREFIX} skipping unplayable upcoming ${identity}: ${msg}`)
            const dropped = await withGuildPlayerQueueLock(guildId, async () => {
                const live = livePlayer(getLivePlayer, guildId)
                if (!live) return "no_player" as const
                await replaceUpcomingAt(live, index, identity, null)
                return "continue" as const
            })
            if (dropped === "no_player") return "no_player"
        }
    }
}

/** Fills current + next {@link PREFETCH_UPCOMING_COUNT} upcoming slots. */
export async function ensurePrefetchWindow(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    config: CompanionPlaybackConfig | null = playbackConfig()
): Promise<PlaybackWindowResult> {
    const current = await ensureCurrentPlayable(getLivePlayer, guildId, config)
    if (current !== "ok") return current
    for (let i = 0; i < PREFETCH_UPCOMING_COUNT; i++) {
        const slot = await ensureUpcomingSlotPlayable(getLivePlayer, guildId, i, config)
        if (slot === "no_player") return "no_player"
        if (slot === "empty") return "ok"
        if (slot === "deferred") return "deferred"
    }
    return "ok"
}

/** Fire-and-forget prefetch; no-ops if the live player is gone. */
export function schedulePrefetchWindow(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    config: CompanionPlaybackConfig | null = playbackConfig()
): void {
    void ensurePrefetchWindow(getLivePlayer, guildId, config).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        windowLogger(config).warn(`${LOG_PREFIX} prefetch failed for ${guildId}: ${msg}`)
    })
}

/**
 * On companion HTTP trackError: re-mint that item once, then skip-and-refill.
 */
export async function retryCompanionPlaybackOnce(
    getLivePlayer: () => Player | undefined,
    guildId: string,
    failedTrack: Track | UnresolvedTrack | null,
    config: CompanionPlaybackConfig | null = playbackConfig()
): Promise<"retried" | "skip"> {
    if (
        !failedTrack ||
        !isCompanionResolvedTrack(failedTrack) ||
        isCompanionRetryUsed(failedTrack)
    ) {
        return "skip"
    }
    markCompanionRetryUsed(failedTrack)
    const snapshot = livePlayer(getLivePlayer, guildId)
    if (!snapshot) return "skip"
    try {
        const resolved = await prepareTrack(snapshot, failedTrack, config, { force: true })
        const applied = await withGuildPlayerQueueLock(guildId, async () => {
            const live = livePlayer(getLivePlayer, guildId)
            if (!live) return false
            if (
                live.queue.current &&
                queueTrackIdentity(live.queue.current) === queueTrackIdentity(failedTrack)
            ) {
                assignCurrent(live, resolved)
                return true
            }
            return false
        })
        if (!applied) return "skip"
        const live = livePlayer(getLivePlayer, guildId)
        if (!live) return "skip"
        await live.play()
        return "retried"
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        windowLogger(config).warn(`${LOG_PREFIX} companion retry failed: ${msg}`)
        return "skip"
    }
}
