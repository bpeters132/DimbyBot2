import type {
    DownloadFileMetadata,
    DownloadsMetadataStore,
    GuildSettings,
    GuildSettingsStore,
} from "../types/index.js"
import { downloadMetadataStoreKey } from "./downloadMetadataKeys.js"

const DISCORD_LOG_LEVELS = new Set(["debug", "info", "warn", "error"])
const DOWNLOAD_METADATA_KEYS = new Set(["guildId", "downloadDate", "originalUrl", "filePath"])

function isDiscordLogShape(value: unknown): boolean {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false
    }
    const log = value as Record<string, unknown>
    if (log.allChannelId !== undefined && typeof log.allChannelId !== "string") {
        return false
    }
    if (log.minLevel !== undefined) {
        if (typeof log.minLevel !== "string" || !DISCORD_LOG_LEVELS.has(log.minLevel)) {
            return false
        }
    }
    if (log.byLevel !== undefined) {
        if (log.byLevel === null || typeof log.byLevel !== "object" || Array.isArray(log.byLevel)) {
            return false
        }
        for (const [level, channelId] of Object.entries(log.byLevel as Record<string, unknown>)) {
            if (!DISCORD_LOG_LEVELS.has(level) || typeof channelId !== "string") {
                return false
            }
        }
    }
    return true
}

/** True when a guild-settings row has the expected types for known persisted fields. Extra keys are allowed. */
function isGuildSettingsEntryShape(settings: unknown): boolean {
    if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
        return false
    }
    const row = settings as Record<string, unknown>
    if (row.controlChannelId !== undefined && typeof row.controlChannelId !== "string") {
        return false
    }
    if (row.controlMessageId !== undefined && typeof row.controlMessageId !== "string") {
        return false
    }
    if (row.downloadsMaxMb !== undefined && typeof row.downloadsMaxMb !== "number") {
        return false
    }
    if (row.discordLog !== undefined && !isDiscordLogShape(row.discordLog)) {
        return false
    }
    return true
}

/** True when `parsed` is a plain object map of guild id → settings object (not array/null entries). */
export function isGuildSettingsStoreShape(parsed: unknown): parsed is GuildSettingsStore {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return false
    }
    for (const [, settings] of Object.entries(parsed as Record<string, unknown>)) {
        if (!isGuildSettingsEntryShape(settings)) {
            return false
        }
    }
    return true
}

/** True when a download metadata entry has only the defined optional fields of the expected types. */
export function isDownloadMetadataEntryShape(entry: unknown): entry is DownloadFileMetadata {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return false
    }
    const candidate = entry as Record<string, unknown>
    for (const key of Object.keys(candidate)) {
        if (!DOWNLOAD_METADATA_KEYS.has(key)) {
            return false
        }
    }
    if (candidate.guildId !== undefined && typeof candidate.guildId !== "string") {
        return false
    }
    if (
        candidate.downloadDate !== undefined &&
        typeof candidate.downloadDate !== "string" &&
        typeof candidate.downloadDate !== "number"
    ) {
        return false
    }
    if (candidate.originalUrl !== undefined && typeof candidate.originalUrl !== "string") {
        return false
    }
    if (candidate.filePath !== undefined && typeof candidate.filePath !== "string") {
        return false
    }
    return true
}

export type JsonMigrationCollectResult<TStore> = {
    validEntries: TStore
    failedEntries: string[]
    failedCount: number
}

/**
 * Filters a validated guild-settings map into rows ready for DB upsert.
 * Empty guild ids and non-object values are counted as failures (partial migration may continue).
 */
export function collectValidGuildSettingsEntries(
    parsed: GuildSettingsStore
): JsonMigrationCollectResult<GuildSettingsStore> {
    const validEntries: GuildSettingsStore = {}
    const failedEntries: string[] = []
    let failedCount = 0

    for (const [guildId, settings] of Object.entries(parsed)) {
        if (!guildId || typeof settings !== "object" || settings === null) {
            failedCount++
            failedEntries.push(`guild:${String(guildId)}`)
            continue
        }
        validEntries[guildId] = settings as GuildSettings
    }

    return { validEntries, failedEntries, failedCount }
}

/**
 * Filters download metadata JSON entries into composite store keys for DB upsert.
 * Missing/blank guild ids become the `UNKNOWN` sentinel (matches historical migration behavior).
 */
export function collectValidDownloadMetadataEntries(
    parsed: Record<string, unknown>
): JsonMigrationCollectResult<DownloadsMetadataStore> {
    const validEntries: DownloadsMetadataStore = {}
    const failedEntries: string[] = []
    let failedCount = 0

    for (const [fileName, metadata] of Object.entries(parsed)) {
        if (!fileName || !isDownloadMetadataEntryShape(metadata)) {
            failedCount++
            failedEntries.push(`file:${String(fileName)}`)
            continue
        }
        const gid =
            typeof metadata.guildId === "string" && metadata.guildId.trim().length > 0
                ? metadata.guildId.trim()
                : "UNKNOWN"
        const storeKey = downloadMetadataStoreKey(gid, fileName)
        validEntries[storeKey] = {
            ...metadata,
            guildId: gid,
        }
    }

    return { validEntries, failedEntries, failedCount }
}
