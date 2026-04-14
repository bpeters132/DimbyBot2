import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type {
    PlayerStateResponse,
    PlayerTrackSummary,
    QueueResponse,
    QueueTrackSummary,
    QueueUpdateMessage,
} from "../types/web.js"
import {
    DASHBOARD_REQUESTER_KEY,
    type DashboardRequesterSnapshot,
} from "../util/dashboardRequesterSnapshot.js"
import { getRequesterUserId } from "../util/rrqDisconnect.js"
import { tryGetBotClient } from "../lib/botClientRegistry.js"
import { webPlayerDebug, webPlayerTrace, webPlayerWarn } from "./web-player-debug-log.js"

const MAX_QUEUE_LIMIT = 100
const REQUESTER_FETCH_CONCURRENCY = 6
const REQUESTER_MISS_CACHE_TTL_MS = 120_000
const REQUESTER_MISS_CACHE_PURGE_INTERVAL_MS = 60_000
const REQUESTER_MISS_CACHE_MAX_ENTRIES = 10_000
const requesterMissCache = new Map<string, number>()

function purgeExpiredRequesterMissCache(): void {
    const now = Date.now()
    for (const [key, expiresAt] of requesterMissCache.entries()) {
        if (expiresAt < now) {
            requesterMissCache.delete(key)
        }
    }
}

function setRequesterMissCacheEntry(key: string, expiresAt: number): void {
    requesterMissCache.set(key, expiresAt)
    // Intentionally FIFO eviction by insertion order: capacity is bounded by
    // REQUESTER_MISS_CACHE_MAX_ENTRIES, and freshness is handled by TTL expiry.
    while (requesterMissCache.size > REQUESTER_MISS_CACHE_MAX_ENTRIES) {
        const oldest = requesterMissCache.keys().next()
        if (oldest.done) break
        requesterMissCache.delete(oldest.value)
    }
}

const missPurgeGlobal = globalThis as typeof globalThis & {
    __dimbyRequesterMissPurgeTimer?: ReturnType<typeof setInterval>
}
if (typeof setInterval !== "undefined" && !missPurgeGlobal.__dimbyRequesterMissPurgeTimer) {
    const timer = setInterval(
        purgeExpiredRequesterMissCache,
        REQUESTER_MISS_CACHE_PURGE_INTERVAL_MS
    )
    missPurgeGlobal.__dimbyRequesterMissPurgeTimer = timer
    if (typeof timer.unref === "function") {
        timer.unref()
    }
}

/** Clears the requester-miss purge interval (tests, dev teardown, or graceful shutdown hooks). */
export function stopRequesterMissCachePurge(): void {
    const t = missPurgeGlobal.__dimbyRequesterMissPurgeTimer
    if (t !== undefined) {
        clearInterval(t)
        missPurgeGlobal.__dimbyRequesterMissPurgeTimer = undefined
    }
}

function repeatModeToLabel(mode: unknown): "off" | "track" | "queue" {
    if (mode === "track" || mode === "queue") {
        return mode
    }
    return "off"
}

function trackThumbnail(track: Track | UnresolvedTrack): string | null {
    const info = track.info
    if (info.artworkUrl) {
        return info.artworkUrl
    }
    if (info.identifier && info.sourceName === "youtube") {
        return `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg`
    }
    return null
}

function requesterId(track: Track | UnresolvedTrack): string | null {
    return getRequesterUserId(track.requester)
}

/** Username / display name embedded on the Lavalink requester (web dashboard or Discord.js user). */
function requesterUsernameFromPayload(requester: unknown): string | null {
    if (requester === null || requester === undefined) return null
    if (typeof requester !== "object") return null
    const o = requester as Record<string, unknown>
    if (typeof o.displayName === "string" && o.displayName.trim()) return o.displayName.trim()
    if (typeof o.globalName === "string" && o.globalName.trim()) return o.globalName.trim()
    if (typeof o.username === "string" && o.username.trim()) return o.username.trim()
    if (typeof o.tag === "string" && o.tag.trim()) return o.tag.trim()
    return null
}

function requesterDebugShape(requester: unknown): string {
    if (requester === undefined) return "undefined"
    if (requester === null) return "null"
    if (typeof requester === "string") return `string(len=${requester.length})`
    if (typeof requester !== "object") return typeof requester
    const ctor = (requester as object).constructor?.name ?? "Object"
    const keys = Object.keys(requester as object)
        .slice(0, 16)
        .join(",")
    return `${ctor}{${keys}}`
}

function displayNameFromGuildCacheSync(guildId: string, snowflake: string): string | null {
    const client = tryGetBotClient()
    if (!client) return null
    const guild = client.guilds.cache.get(guildId)
    if (!guild) return null
    const member = guild.members.cache.get(snowflake)
    if (member) {
        const u = member.user
        return member.displayName || u.globalName || u.username || null
    }
    const user = client.users.cache.get(snowflake)
    if (user) {
        return user.globalName || user.username || null
    }
    return null
}

/**
 * Resolves Discord display labels for queue/player payloads (cache first, then `members.fetch`
 * for cache misses).
 */
async function buildRequesterDisplayMap(
    guildId: string,
    tracks: (Track | UnresolvedTrack)[]
): Promise<Map<string, string>> {
    const client = tryGetBotClient()
    const map = new Map<string, string>()
    if (!client) {
        webPlayerWarn("buildRequesterDisplayMap: no BotClient — cannot resolve requester names", {
            guildId,
            trackCount: tracks.length,
        })
        return map
    }
    const guild = client.guilds.cache.get(guildId)
    if (!guild) {
        webPlayerWarn("buildRequesterDisplayMap: guild not in bot cache", { guildId })
        return map
    }

    for (const track of tracks) {
        const id = getRequesterUserId(track.requester)
        const embedded = requesterUsernameFromPayload(track.requester)
        if (id && embedded) {
            map.set(id, embedded)
        }
    }

    const needFetch = new Set<string>()
    for (const track of tracks) {
        const id = getRequesterUserId(track.requester)
        if (!id || map.has(id)) continue
        const embedded = requesterUsernameFromPayload(track.requester)
        if (embedded) {
            map.set(id, embedded)
            continue
        }
        const cached = displayNameFromGuildCacheSync(guildId, id)
        if (cached) {
            map.set(id, cached)
        } else {
            const missCacheKey = `${guildId}:${id}`
            const missExpiresAt = requesterMissCache.get(missCacheKey)
            if (missExpiresAt && missExpiresAt > Date.now()) {
                continue
            }
            requesterMissCache.delete(missCacheKey)
            needFetch.add(id)
        }
    }

    const queue = [...needFetch]
    const workers = Array.from(
        { length: Math.min(REQUESTER_FETCH_CONCURRENCY, queue.length) },
        () =>
            (async () => {
                while (queue.length > 0) {
                    const id = queue.shift()
                    if (!id || map.has(id)) continue
                    map.set(id, "")
                    const missCacheKey = `${guildId}:${id}`
                    const member = await guild.members.fetch(id).catch((err: unknown) => {
                        setRequesterMissCacheEntry(
                            missCacheKey,
                            Date.now() + REQUESTER_MISS_CACHE_TTL_MS
                        )
                        map.delete(id)
                        webPlayerTrace("members.fetch failed for requester label", {
                            guildId,
                            userIdPrefix: id.slice(0, 8),
                            message: err instanceof Error ? err.message : String(err),
                        })
                        return null
                    })
                    if (!member) continue
                    const u = member.user
                    const label = member.displayName || u.globalName || u.username
                    if (label) {
                        map.set(id, label)
                        requesterMissCache.delete(missCacheKey)
                    } else {
                        map.delete(id)
                    }
                }
            })()
    )
    await Promise.all(workers)

    webPlayerDebug("buildRequesterDisplayMap", {
        guildId,
        trackCount: tracks.length,
        resolvedLabels: map.size,
        fetchedIds: needFetch.size,
    })

    for (const track of tracks) {
        const id = getRequesterUserId(track.requester)
        if (id) continue
        webPlayerTrace("track has no requester id (Requested by will be Unknown)", {
            guildId,
            title: track.info.title?.slice(0, 80),
            requester: requesterDebugShape(track.requester),
        })
    }

    return map
}

function resolveRequesterUsername(
    track: Track | UnresolvedTrack,
    displayMap: Map<string, string>
): string | null {
    const embedded = requesterUsernameFromPayload(track.requester)
    if (embedded) return embedded
    const id = getRequesterUserId(track.requester)
    if (!id) return null
    return displayMap.get(id) ?? null
}

function trackToPlayerTrackSummary(
    track: Track | UnresolvedTrack,
    displayMap: Map<string, string>
): PlayerTrackSummary {
    return {
        title: track.info.title,
        uri: track.info.uri ?? null,
        durationMs: track.info.duration ?? 0,
        isStream: Boolean(track.info.isStream),
        thumbnailUrl: trackThumbnail(track),
        requesterId: requesterId(track),
        requesterUsername: resolveRequesterUsername(track, displayMap),
    }
}

/**
 * `queue.current` is sometimes rehydrated from Lavalink without `requester`; we stamp who
 * requested the track on `trackStart` (see {@link DASHBOARD_REQUESTER_KEY}).
 */
function applyDashboardRequesterFallback(
    player: Player | null,
    summary: PlayerTrackSummary | null
): PlayerTrackSummary | null {
    if (!player || !summary) return summary
    const dash = player.get(DASHBOARD_REQUESTER_KEY) as DashboardRequesterSnapshot | undefined
    if (!dash?.id) return summary
    if (summary.requesterId && summary.requesterId !== dash.id) return summary
    return {
        ...summary,
        requesterId: summary.requesterId ?? dash.id,
        requesterUsername: summary.requesterUsername?.trim() || dash.username?.trim() || null,
    }
}

function trackToQueueTrackSummary(
    track: Track | UnresolvedTrack,
    displayMap: Map<string, string>
): QueueTrackSummary {
    const encoded =
        typeof (track as { encoded?: unknown }).encoded === "string"
            ? (track as { encoded: string }).encoded
            : null
    return {
        title: track.info.title,
        uri: track.info.uri ?? null,
        durationMs: track.info.duration ?? 0,
        isStream: Boolean(track.info.isStream),
        thumbnailUrl: trackThumbnail(track),
        author: track.info.author?.trim() || null,
        sourceName: track.info.sourceName ?? null,
        requesterId: requesterId(track),
        requesterUsername: resolveRequesterUsername(track, displayMap),
        encoded,
    }
}

export function isPlayer(value: unknown): value is Player {
    if (typeof value !== "object" || value === null) return false
    const o = value as Record<string, unknown>
    if (typeof (o as { get?: unknown }).get !== "function") return false
    const queue = o.queue
    if (!queue || typeof queue !== "object") return false
    const tracks = (queue as { tracks?: unknown }).tracks
    if (!Array.isArray(tracks)) return false
    if (typeof o.playing !== "boolean") return false
    if (typeof o.guildId !== "string") return false
    if (o.node !== undefined && (typeof o.node !== "object" || o.node === null)) return false
    return true
}

/** Shared player state body; `currentTrack` must already include requester usernames when needed. */
export function composePlayerStateResponse(
    guildId: string,
    userId: string,
    player: Player | null,
    currentTrack: PlayerTrackSummary | null
): PlayerStateResponse {
    const { inVoiceWithBot, botInVoiceChannel, canQueueTracks } = summarizeVoiceForWeb(
        guildId,
        userId,
        player
    )

    return {
        guildId,
        hasPlayer: Boolean(player),
        status: !player ? "idle" : player.playing ? "playing" : player.paused ? "paused" : "idle",
        positionMs: player?.position ?? 0,
        loopMode: repeatModeToLabel(player?.repeatMode),
        autoplay: Boolean(player?.get("autoplay")),
        volume: player?.volume ?? 100,
        queueCount: player?.queue?.tracks?.length ?? 0,
        inVoiceWithBot,
        botInVoiceChannel,
        canQueueTracks,
        currentTrack,
    }
}

/**
 * Precomputes queue rows + now playing for WebSocket fan-out (one name-resolution pass per event).
 */
export async function buildPlayerBroadcastData(
    guildId: string,
    player: unknown
): Promise<{
    player: Player | null
    queueSummaries: QueueTrackSummary[]
    currentTrack: PlayerTrackSummary | null
}> {
    const p = isPlayer(player) ? player : null
    const queueTracks = p?.queue?.tracks ?? []
    const current = p?.queue?.current ?? null
    const forNames = current ? [current, ...queueTracks] : queueTracks
    const displayMap = await buildRequesterDisplayMap(guildId, forNames)
    const queueSummaries = queueTracks.map((t) => trackToQueueTrackSummary(t, displayMap))
    const currentTrackRaw = current ? trackToPlayerTrackSummary(current, displayMap) : null
    const currentTrack = applyDashboardRequesterFallback(p, currentTrackRaw)
    return { player: p, queueSummaries, currentTrack }
}

/** Bot VC from Lavalink player when set; otherwise Discord.js (covers brief desync after connect). */
export function resolveBotVoiceChannelId(
    guildId: string,
    player?: Player | null,
    clientArg?: VoiceSummaryClient | null
): string | null {
    const p = player ?? null
    if (p?.voiceChannelId) {
        return p.voiceChannelId
    }
    const client = clientArg ?? tryGetBotClient()
    if (!client) {
        return null
    }
    const guild = client.guilds.cache.get(guildId)
    return guild?.members.me?.voice?.channelId ?? null
}

type VoiceSummaryClient = {
    guilds: {
        cache: Map<
            string,
            {
                members: { me?: { voice?: { channelId?: string | null } | null } | null }
                voiceStates: { cache: Map<string, { channelId?: string | null }> }
            }
        >
    }
}

/** Voice context for dashboard permission copy and queue actions. */
export function summarizeVoiceForWeb(
    guildId: string,
    userId: string,
    player?: unknown,
    clientArg?: VoiceSummaryClient | null
): { inVoiceWithBot: boolean; botInVoiceChannel: boolean; canQueueTracks: boolean } {
    const client = clientArg ?? tryGetBotClient()
    const guild = client?.guilds.cache.get(guildId)
    const userVoiceChannelId = guild?.voiceStates.cache.get(userId)?.channelId ?? null
    const botVoiceChannelId = resolveBotVoiceChannelId(
        guildId,
        isPlayer(player) ? player : null,
        client
    )
    const botInVoiceChannel = botVoiceChannelId !== null
    const userInVoice = userVoiceChannelId !== null
    const inVoiceWithBot =
        userInVoice && botInVoiceChannel && userVoiceChannelId === botVoiceChannelId
    const canQueueTracks = userInVoice && (!botInVoiceChannel || inVoiceWithBot)
    return { inVoiceWithBot, botInVoiceChannel, canQueueTracks }
}

export function resolveInVoiceWithBot(guildId: string, userId: string, player?: unknown): boolean {
    return summarizeVoiceForWeb(guildId, userId, player).inVoiceWithBot
}

export async function toPlayerStateResponse(
    guildId: string,
    userId: string,
    player: unknown
): Promise<PlayerStateResponse> {
    const p = isPlayer(player) ? player : null
    const current = p?.queue?.current ?? null
    const displayMap = await buildRequesterDisplayMap(guildId, current ? [current] : [])
    const currentTrackRaw = current ? trackToPlayerTrackSummary(current, displayMap) : null
    const currentTrack = applyDashboardRequesterFallback(p, currentTrackRaw)
    const result = composePlayerStateResponse(guildId, userId, p, currentTrack)
    webPlayerDebug("toPlayerStateResponse", {
        guildId,
        viewerIdPrefix: userId.slice(0, 8),
        inVoiceWithBot: result.inVoiceWithBot,
        botInVoiceChannel: result.botInVoiceChannel,
        canQueueTracks: result.canQueueTracks,
        currentRequesterId: result.currentTrack?.requesterId ?? null,
        currentRequesterUsername: result.currentTrack?.requesterUsername ?? null,
    })
    return result
}

export async function toQueueResponse(
    guildId: string,
    player: unknown,
    page = 1,
    limit = 20
): Promise<QueueResponse> {
    const p = isPlayer(player) ? player : null
    const queue = p?.queue?.tracks ?? []
    const total = queue.length
    const normalizedPage = Math.max(1, Math.floor(Number(page) || 1))
    const normalizedLimit = Math.min(MAX_QUEUE_LIMIT, Math.max(1, Math.floor(Number(limit) || 20)))
    const offset = (normalizedPage - 1) * normalizedLimit
    const slice = queue.slice(offset, offset + normalizedLimit)
    const displayMap = await buildRequesterDisplayMap(guildId, slice)
    const items = slice.map((t) => trackToQueueTrackSummary(t, displayMap))
    const totalPages = Math.max(1, Math.ceil(total / normalizedLimit))

    return {
        guildId,
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        items,
    }
}

export async function toQueueSnapshotMessage(
    guildId: string,
    userId: string,
    player: unknown
): Promise<QueueUpdateMessage> {
    const {
        player: p,
        queueSummaries,
        currentTrack,
    } = await buildPlayerBroadcastData(guildId, player)
    const state = composePlayerStateResponse(guildId, userId, p, currentTrack)
    return {
        type: "queueUpdate",
        guildId,
        state,
        queue: queueSummaries,
    }
}
