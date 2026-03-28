import type { AudioPlayer, VoiceConnection } from "@discordjs/voice"
import type {
    ChatInputCommandInteraction,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js"

/** Bot client type alias for command / event handlers (avoids circular imports in docs). */
export type BotClient = import("../lib/BotClient.js").default

/**
 * Slash command `data` shape: any discord.js slash builder that serializes for REST.
 * (Fluent APIs return narrowed builder types, not the root SlashCommandBuilder class.)
 */
export interface SlashCommandData {
    readonly name: string
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody
}

/** Slash command `execute` — may return Discord.js reply handles; callers should not rely on them. */
export type SlashCommandExecute = (
    interaction: ChatInputCommandInteraction,
    client: BotClient
) => Promise<unknown>

export interface Command {
    data: SlashCommandData
    execute: SlashCommandExecute
    category?: string
    aliases?: string[]
}

export type EventSetup = (client: BotClient) => void | Promise<void>

/** Severity labels used for Discord log routing (matches the bot logger). */
export type DiscordLogLevelName = "debug" | "info" | "warn" | "error"

/**
 * Per-guild Discord log forwarding: one channel for all levels (`allChannelId`) and/or
 * overrides per level (`byLevel`). `minLevel` drops lower severities before any channel is chosen.
 */
export interface GuildDiscordLogSettings {
    allChannelId?: string
    byLevel?: Partial<Record<DiscordLogLevelName, string>>
    minLevel?: DiscordLogLevelName
}

/** Per-guild fields persisted in `storage/guild_settings.json`. */
export interface GuildSettings {
    controlChannelId?: string
    controlMessageId?: string
    /** Optional per-guild cap for the downloads folder (MB). */
    downloadsMaxMb?: number
    /** Optional forwarding of bot log lines to Discord channels in this guild. */
    discordLog?: GuildDiscordLogSettings
}

/** Map of Discord guild id → settings for that guild. */
export type GuildSettingsStore = Record<string, GuildSettings>

export interface LocalFile {
    name: string
    path: string
    title: string
}

export interface LocalPlayerState {
    isPlaying: boolean
    trackTitle?: string
    requesterId?: string
    startedAt?: number
}

export interface ActiveLocalPlayer {
    audioPlayer: AudioPlayer
    connection: VoiceConnection
    /** Registered `VoiceConnectionStatus.Disconnected` listener (removed on destroy / replace). */
    onDisconnected?: () => void
    currentTrack: LocalFile
    requesterId?: string
    startedAt: number
}

export interface QueryPlayResult {
    success: boolean
    feedbackText: string
    error?: Error
}

/** Entry in `downloads/.metadata.json` for a single `.wav` file. */
export interface DownloadFileMetadata {
    guildId?: string
    downloadDate?: number | string
    originalUrl?: string
    filePath?: string
}

export type DownloadsMetadataStore = Record<string, DownloadFileMetadata>

export type DiscordLogForwarder = (level: DiscordLogLevelName, message: string) => void

export interface LoggerInterface {
    info(text: string, ...args: unknown[]): void
    warn(text: string, ...args: unknown[]): void
    error(text: string, ...args: unknown[]): void
    debug(text: string, ...args: unknown[]): void
    setDebugEnabled(enabled: boolean): void
    getDebugEnabled(): boolean
    getLogFilePath(): string | null
    /** When set, each log line is forwarded (e.g. to Discord) after console/file logging. */
    setDiscordForwarder?(callback: DiscordLogForwarder | null): void
}

/** Tracks a user who left voice while RRQ is active and has queued tracks. */
export interface DisconnectedRRQUser {
    userId: string
    /** Epoch ms when the user left the voice channel. */
    leftAt: number
    timeoutHandle: NodeJS.Timeout
}

/**
 * Per-player map of disconnected users pending queue cleanup.
 * Stored on the player via `player.set("rrqDisconnectedUsers", map)`.
 */
export type RRQDisconnectedUsersMap = Map<string, DisconnectedRRQUser>
