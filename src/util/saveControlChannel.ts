import fs from "fs"
import path from "path"
import type { GuildSettings, GuildSettingsStore } from "../types/index.js"
import type { LoggerInterface } from "../types/index.js"
import {
    getGuildSettingsStoreFromDatabase,
    replaceGuildSettingsStoreInDatabase,
} from "../repositories/guildSettingsRepository.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

const __dirname = import.meta.dirname

const storageDir = path.join(__dirname, "..", "..", "storage")
/** In-memory store loaded from database at startup. */
let guildSettingsCache: GuildSettingsStore = {}
let guildSettingsInitialized = false
let saveGuildSettingsChain: Promise<void> = Promise.resolve()

/** Returns whether {@link initializeGuildSettingsStore} has finished loading settings from the database. */
export function isGuildSettingsInitialized(): boolean {
    return guildSettingsInitialized
}

function cloneGuildSettingsStore(store: GuildSettingsStore): GuildSettingsStore {
    return typeof structuredClone === "function"
        ? structuredClone(store)
        : (JSON.parse(JSON.stringify(store)) as GuildSettingsStore)
}

/**
 * Ensures that the storage directory exists, creating it if necessary.
 */
export function ensureStorageDir(loggerInstance?: Partial<LoggerInterface>) {
    const logger = loggerFromPartial(loggerInstance)
    if (!fs.existsSync(storageDir)) {
        logger.debug(
            `[guildSettings] Storage directory ${storageDir} not found, attempting creation.`
        )
        try {
            fs.mkdirSync(storageDir, { recursive: true })
            logger.info(`[guildSettings] Created storage directory at: ${storageDir}`)
        } catch (error: unknown) {
            logger.error(`[guildSettings] Error creating storage directory: ${error}`)
        }
    }
}

async function readGuildSettingsFromDatabase(
    loggerInstance?: Partial<LoggerInterface>
): Promise<GuildSettingsStore> {
    const logger = loggerFromPartial(loggerInstance)
    logger.debug("[guildSettings] Attempting to load settings from database.")
    try {
        const store = await getGuildSettingsStoreFromDatabase()
        logger.debug(
            `[guildSettings] Successfully loaded ${Object.keys(store).length} guild settings rows.`
        )
        return store
    } catch (error: unknown) {
        logger.error(`[guildSettings] Error reading guild settings from database: ${error}`)
        throw error
    }
}

/** Loads guild settings from the database into the in-memory cache. */
export async function initializeGuildSettingsStore(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const store = await readGuildSettingsFromDatabase(loggerInstance)
    guildSettingsCache = cloneGuildSettingsStore(store)
    guildSettingsInitialized = true
}

/**
 * Returns a cloned snapshot of the guild settings loaded at startup.
 * This throws until `guildSettingsInitialized` is true, and never exposes a live mutable reference.
 * The returned value is a clone produced by `cloneGuildSettingsStore(guildSettingsCache)`.
 */
export function getGuildSettings(): GuildSettingsStore {
    if (!guildSettingsInitialized) {
        throw new Error(
            "Guild settings accessed before initialization. Call initializeGuildSettingsStore() first. Check that guildSettingsInitialized is true before calling getGuildSettings."
        )
    }
    return cloneGuildSettingsStore(guildSettingsCache)
}

async function withGuildSettingsSaveLock<T>(work: () => Promise<T>): Promise<T> {
    let release: () => void = () => {}
    const previous = saveGuildSettingsChain
    saveGuildSettingsChain = new Promise<void>((resolve) => {
        release = resolve
    })
    await previous
    try {
        return await work()
    } finally {
        release()
    }
}

const GUILD_SETTING_FIELD_KEYS: (keyof GuildSettings)[] = [
    "controlChannelId",
    "controlMessageId",
    "downloadsMaxMb",
    "discordLog",
]

function cloneGuildSettingsRow(row: GuildSettings): GuildSettings {
    return typeof structuredClone === "function"
        ? structuredClone(row)
        : (JSON.parse(JSON.stringify(row)) as GuildSettings)
}

/**
 * Merges only fields present in `snapshotRow` onto `dbRow`, then removes `clearedFields`.
 * Omitted snapshot fields keep their latest database values (prevents cross-field clobber races).
 */
function mergeGuildSettingsRow(
    dbRow: GuildSettings | undefined,
    snapshotRow: GuildSettings | undefined,
    clearedFields: (keyof GuildSettings)[] = []
): GuildSettings {
    const merged: GuildSettings = dbRow ? cloneGuildSettingsRow(dbRow) : {}
    if (snapshotRow) {
        for (const key of GUILD_SETTING_FIELD_KEYS) {
            if (key in snapshotRow) {
                merged[key] = snapshotRow[key]
            }
        }
    }
    for (const key of clearedFields) {
        delete merged[key]
    }
    return merged
}

export type SaveGuildSettingsOptions = {
    /** Guild IDs to delete from the database (must be intentional removals, not snapshot omissions). */
    deleteGuildIds?: string[]
    /**
     * Guild rows to take from `settings` when persisting. When set, other guilds in `settings` are
     * ignored and the latest database values are kept (prevents lost updates across concurrent saves).
     */
    touchedGuildIds?: string[]
    /** Per-guild setting fields to clear explicitly (e.g. control-channel unset). */
    clearedGuildFields?: Partial<Record<string, (keyof GuildSettings)[]>>
}

/**
 * Persists guild settings to database. On success, replaces the in-memory cache with `settings`.
 * @returns whether the database write succeeded
 */
export async function saveGuildSettings(
    settings: GuildSettingsStore,
    loggerInstance?: Partial<LoggerInterface>,
    options?: SaveGuildSettingsOptions
): Promise<boolean> {
    const settingsSnapshot = cloneGuildSettingsStore(settings)
    const deleteGuildIds = (options?.deleteGuildIds ?? []).filter(
        (id) => typeof id === "string" && id.length > 0
    )
    const hasTouchedOption = options?.touchedGuildIds !== undefined
    const touchedGuildIds = (options?.touchedGuildIds ?? []).filter(
        (id) => typeof id === "string" && id.length > 0
    )
    const clearedGuildFields = options?.clearedGuildFields ?? {}
    return withGuildSettingsSaveLock(async () => {
        const logger = loggerFromPartial(loggerInstance)
        logger.debug("[guildSettings] Attempting to save settings to database.")
        try {
            const dbStore = await readGuildSettingsFromDatabase(logger)
            const merged = cloneGuildSettingsStore(dbStore)
            const guildIdsToApply = hasTouchedOption
                ? touchedGuildIds
                : Object.keys(settingsSnapshot)
            for (const guildId of guildIdsToApply) {
                const cleared = (clearedGuildFields[guildId] ?? []).filter(
                    (key): key is keyof GuildSettings =>
                        typeof key === "string" &&
                        (GUILD_SETTING_FIELD_KEYS as string[]).includes(key)
                )
                const row = settingsSnapshot[guildId]
                const nextRow = mergeGuildSettingsRow(merged[guildId], row, cleared)
                if (Object.keys(nextRow).length === 0) {
                    delete merged[guildId]
                } else {
                    merged[guildId] = nextRow
                }
            }
            for (const guildId of deleteGuildIds) {
                delete merged[guildId]
            }
            const result = await replaceGuildSettingsStoreInDatabase(merged, {
                deleteGuildIds,
            })
            const reloaded = await readGuildSettingsFromDatabase(logger)
            guildSettingsCache = cloneGuildSettingsStore(reloaded)
            guildSettingsInitialized = true
            logger.debug(
                `[guildSettings] Successfully saved guild settings (upserted=${result.rowsUpserted}, deleted=${result.rowsDeleted}, affected=${result.rowsAffected}).`
            )
            return true
        } catch (error: unknown) {
            logger.error(`[guildSettings] Error writing guild settings to database: ${error}`)
            return false
        }
    })
}
