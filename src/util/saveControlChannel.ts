import fs from "fs"
import path from "path"
import type { GuildSettingsStore } from "../types/index.js"
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

function cloneGuildSettingsStore(store: GuildSettingsStore): GuildSettingsStore {
    return structuredClone(store)
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

/**
 * Persists guild settings to database. On success, replaces the in-memory cache with `settings`.
 * @returns whether the database write succeeded
 */
export async function saveGuildSettings(
    settings: GuildSettingsStore,
    loggerInstance?: Partial<LoggerInterface>
): Promise<boolean> {
    const logger = loggerFromPartial(loggerInstance)
    logger.debug("[guildSettings] Attempting to save settings to database.")
    try {
        const result = await replaceGuildSettingsStoreInDatabase(settings)
        guildSettingsCache = cloneGuildSettingsStore(settings)
        logger.debug(`[guildSettings] Successfully saved ${result.rowsWritten} rows to database.`)
        return true
    } catch (error: unknown) {
        logger.error(`[guildSettings] Error writing guild settings to database: ${error}`)
        return false
    }
}
