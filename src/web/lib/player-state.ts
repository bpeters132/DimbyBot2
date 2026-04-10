import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type {
    PlayerStateResponse,
    QueueResponse,
    QueueTrackSummary,
    QueueUpdateMessage,
} from "../types/web.js"
import { getBotClient } from "./botClient.js"

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
    const requester = track.requester as { id?: string } | undefined
    return requester?.id ?? null
}

function isPlayer(value: unknown): value is Player {
    return typeof value === "object" && value !== null && "queue" in value && "playing" in value
}

export function toQueueTrackSummary(track: Track | UnresolvedTrack): QueueTrackSummary {
    return {
        title: track.info.title,
        uri: track.info.uri ?? null,
        durationMs: track.info.duration ?? 0,
        isStream: Boolean(track.info.isStream),
        thumbnailUrl: trackThumbnail(track),
        author: track.info.author?.trim() || null,
        sourceName: track.info.sourceName ?? null,
        requesterId: requesterId(track),
    }
}

/** Bot VC from Lavalink player when set; otherwise Discord.js (covers brief desync after connect). */
export function resolveBotVoiceChannelId(guildId: string, player?: Player | null): string | null {
    const p = player ?? null
    if (p?.voiceChannelId) {
        return p.voiceChannelId
    }
    const guild = getBotClient().guilds.cache.get(guildId)
    return guild?.members.me?.voice?.channelId ?? null
}

/** Voice context for dashboard permission copy and queue actions. */
export function summarizeVoiceForWeb(
    guildId: string,
    userId: string,
    player?: unknown
): { inVoiceWithBot: boolean; botInVoiceChannel: boolean; canQueueTracks: boolean } {
    const guild = getBotClient().guilds.cache.get(guildId)
    const userVoiceChannelId = guild?.voiceStates.cache.get(userId)?.channelId ?? null
    const botVoiceChannelId = resolveBotVoiceChannelId(guildId, isPlayer(player) ? player : null)
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

export function toPlayerStateResponse(
    guildId: string,
    userId: string,
    player: unknown
): PlayerStateResponse {
    const p = isPlayer(player) ? player : null
    const current = p?.queue?.current ?? null
    const { inVoiceWithBot, botInVoiceChannel, canQueueTracks } = summarizeVoiceForWeb(
        guildId,
        userId,
        p
    )

    return {
        guildId,
        hasPlayer: Boolean(p),
        status: !p ? "idle" : p.playing ? "playing" : p.paused ? "paused" : "idle",
        positionMs: p?.position ?? 0,
        loopMode: repeatModeToLabel(p?.repeatMode),
        autoplay: Boolean(p?.get("autoplay")),
        volume: p?.volume ?? 100,
        queueCount: p?.queue?.tracks?.length ?? 0,
        inVoiceWithBot,
        botInVoiceChannel,
        canQueueTracks,
        currentTrack: current
            ? {
                  title: current.info.title,
                  uri: current.info.uri ?? null,
                  durationMs: current.info.duration ?? 0,
                  isStream: Boolean(current.info.isStream),
                  thumbnailUrl: trackThumbnail(current),
                  requesterId: requesterId(current),
              }
            : null,
    }
}

export function toQueueResponse(
    guildId: string,
    player: unknown,
    page = 1,
    limit = 20
): QueueResponse {
    const p = isPlayer(player) ? player : null
    const queue = p?.queue?.tracks ?? []
    const total = queue.length
    const normalizedPage = Math.max(1, page)
    const normalizedLimit = Math.max(1, limit)
    const offset = (normalizedPage - 1) * normalizedLimit
    const items = queue.slice(offset, offset + normalizedLimit).map(toQueueTrackSummary)
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

export function toQueueSnapshotMessage(
    guildId: string,
    userId: string,
    player: unknown
): QueueUpdateMessage {
    const p = isPlayer(player) ? player : null
    return {
        type: "queueUpdate",
        guildId,
        state: toPlayerStateResponse(guildId, userId, p),
        queue: (p?.queue?.tracks ?? []).map(toQueueTrackSummary),
    }
}
