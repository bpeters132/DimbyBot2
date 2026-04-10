export interface ApiErrorPayload {
    error: string
    details?: string
}

export interface ApiSuccessPayload<T> {
    ok: true
    data: T
}

export interface ApiFailurePayload {
    ok: false
    error: ApiErrorPayload
}

export type ApiResponse<T> = ApiSuccessPayload<T> | ApiFailurePayload

export interface GuildListItem {
    id: string
    name: string
    iconUrl: string | null
    memberCount: number | null
}

export interface GuildListResponse {
    guilds: GuildListItem[]
    botInviteUrl?: string
}

export interface PlayerTrackSummary {
    title: string
    uri: string | null
    durationMs: number
    isStream: boolean
    thumbnailUrl: string | null
    requesterId: string | null
}

export interface QueueTrackSummary {
    title: string
    uri: string | null
    durationMs: number
    isStream: boolean
    requesterId: string | null
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
    botInVoiceChannel: boolean
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
    type:
        | "trackStart"
        | "trackEnd"
        | "playerPause"
        | "playerResume"
        | "queueUpdate"
        | "playerDestroy"
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

export interface WsSubscribedMessage {
    type: "subscribed"
    guildId: string
}

export interface WsPingMessage {
    type: "ping"
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
    | WsSubscribedMessage
    | WsPingMessage
    | WsErrorMessage
