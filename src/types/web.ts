export type {
    ApiErrorPayload,
    ApiFailurePayload,
    ApiResponse,
    ApiSuccessPayload,
} from "./apiPayloads.js"

/** Response shape for `GET /api/status` (database + bot HTTP probes). */
export interface StatusPayload {
    ok: boolean
    checkedAt: string
    database: { ok: boolean; message?: string }
    botApi: { ok: boolean; message?: string }
}

/** Active bot player snapshot for a guild on the dashboard server list. */
export interface GuildListPlayerSummary {
    status: "playing" | "paused" | "idle"
    botInVoiceChannel: boolean
    inVoiceWithBot: boolean
    currentTrackTitle: string | null
    currentTrackAuthor: string | null
    queueCount: number
}

export interface GuildListItem {
    id: string
    name: string
    iconUrl: string | null
    memberCount: number | null
    /** Present when the bot has a player session or is connected to voice in this guild. */
    player: GuildListPlayerSummary | null
}

export interface GuildListResponse {
    guilds: GuildListItem[]
    botInviteUrl?: string
}

/** Guild where the signed-in user shares a VC with an active bot player session. */
export interface ActivePlayerGuildContext {
    guildId: string
    guildName: string
    guildIconUrl: string | null
    status: "playing" | "paused" | "idle"
    currentTrackTitle: string | null
}

export interface VoiceContextResponse {
    activeGuild: ActivePlayerGuildContext | null
}

/**
 * Serialized guild permission state for the dashboard UI (mirrors bot API checks, including OAuth
 * fallback when the bot has not resolved a {@link GuildMember} yet).
 */
export interface GuildDashboardPermissionSnapshot {
    memberResolved: boolean
    primaryPermissions: string[]
    oauthPermissions: string[]
    optimisticBotUnavailable?: boolean
}

/** Result of loading {@link GuildDashboardPermissionSnapshot} in a server action or RSC. */
export type GuildDashboardSnapshotResult =
    | { ok: false; status: number; error: string; details?: string }
    /** `discordUserId` is the resolved Discord snowflake (same value used for permissions and bot API). */
    | { ok: true; snapshot: GuildDashboardPermissionSnapshot; discordUserId: string }

export interface PlayerTrackSummary {
    title: string
    uri: string | null
    durationMs: number
    isStream: boolean
    thumbnailUrl: string | null
    requesterId: string | null
    /** Guild nickname / global name / username when resolved; null if unknown. */
    requesterUsername: string | null
}

export interface QueueTrackSummary extends PlayerTrackSummary {
    author: string | null
    sourceName: string | null
    /** Lavalink track identifier when present (stable list keys for the dashboard); null when unknown. */
    encoded: string | null
}

export interface PlayerStateResponse {
    guildId: string
    hasPlayer: boolean
    status: "playing" | "paused" | "idle"
    positionMs: number
    loopMode: "off" | "track" | "queue"
    autoplay: boolean
    volume: number
    queueCount: number
    inVoiceWithBot: boolean
    /** Bot is connected to a voice channel in this guild (Lavalink or Discord.js). */
    botInVoiceChannel: boolean
    /** User may add/play-from-search when in a VC (any if bot is not in voice; same VC if bot is). */
    canQueueTracks: boolean
    currentTrack: PlayerTrackSummary | null
}

export interface QueueResponse {
    guildId: string
    page: number
    limit: number
    total: number
    totalPages: number
    items: QueueTrackSummary[]
}

export interface VoiceStateMessage {
    type: "voiceStateChange"
    guildId: string
    userId: string
    inVoiceWithBot: boolean
    botInVoiceChannel: boolean
    canQueueTracks: boolean
}

export interface PlayerUpdateMessage {
    type: "trackStart" | "trackEnd" | "playerPause" | "playerResume" | "playerDestroy"
    guildId: string
    state: PlayerStateResponse
    queue: QueueTrackSummary[]
}

export interface QueueUpdateMessage {
    type: "queueUpdate"
    guildId: string
    queue: QueueTrackSummary[]
    state: PlayerStateResponse
}

export interface WsSubscribeMessage {
    type: "subscribe"
    guildId: string
}

export interface WsUnsubscribeMessage {
    type: "unsubscribe"
    guildId: string
}

export interface WsSubscribedMessage {
    type: "subscribed"
    guildId: string
}

export interface WsUnsubscribedMessage {
    type: "unsubscribed"
    guildId: string
}

export interface WsPingMessage {
    type: "ping"
}

export interface WsPongMessage {
    type: "pong"
}

/** Server-side failure (e.g. subscribe denied); not the same as missing voice or no Lavalink player. */
export interface WsErrorMessage {
    type: "error"
    code?: string
    message: string
}

export type WSMessage =
    | VoiceStateMessage
    | PlayerUpdateMessage
    | QueueUpdateMessage
    | WsSubscribeMessage
    | WsUnsubscribeMessage
    | WsSubscribedMessage
    | WsUnsubscribedMessage
    | WsPingMessage
    | WsPongMessage
    | WsErrorMessage

export interface AdminMetricsPlayerSummary {
    guildId: string
    guildName: string | null
    status: "playing" | "paused" | "idle"
    queueSize: number
    currentTrack: { title: string; author?: string; uri?: string } | null
}

/** One Discord guild the bot is in (from guild cache). */
export interface AdminGuildSummary {
    guildId: string
    guildName: string
    memberCount: number | null
}

export interface AdminMetricsResponse {
    /** Guilds the bot is currently in (Discord.js cache). */
    guildCount: number
    activePlayers: number
    nodeCount: number
    guilds: AdminGuildSummary[]
    players: AdminMetricsPlayerSummary[]
}

export interface ErrorHistoryEntry {
    timestamp: number
    level: "error" | "warn"
    message: string
    guildId?: string
    stack?: string
}

export interface AdminErrorsListResponse {
    entries: ErrorHistoryEntry[]
}

export interface AdminDbStatsResponse {
    sessions: { total: number; expired: number }
    verifications: { total: number; expired: number }
}

export type AdminDbCleanupTarget = "sessions" | "verifications" | "all"

export interface AdminDbCleanupResponse {
    dryRun: boolean
    deleted: { sessions?: number; verifications?: number }
}

export type {
    PlaylistData,
    PlaylistSummary,
    PlaylistTrackData,
} from "./index.js"

import type { PlaylistSummary } from "./index.js"

export interface PlaylistListResponse {
    playlists: PlaylistSummary[]
}

export interface AddPlaylistTrackBody {
    title: string
    uri: string
    author: string
    duration: number
    thumbnailUrl?: string | null
    addedAt: string
}

export interface AddPlaylistTrackFromQueryBody {
    query: string
    /** Prefer Lavalink search via this guild's player when set. */
    guildId?: string
}

/** Playlist track as returned in JSON API responses (`addedAt` is ISO string). */
export interface SerializedPlaylistTrackData {
    id: number
    title: string
    uri: string
    author: string
    duration: number
    thumbnailUrl: string | null
    addedAt: string
    position: number
}

export interface AddTracksFromQueryResponse {
    added: number
    tracks: SerializedPlaylistTrackData[]
}

export interface ReorderPlaylistTrackBody {
    newPosition: number
}

export interface PlaylistPlayResponse {
    state: PlayerStateResponse
    playlistId: number
    playlistName: string
    queued: number
    failed: number
    shuffle: boolean
}
