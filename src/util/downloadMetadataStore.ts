import type { DownloadsMetadataStore, LoggerInterface } from "../types/index.js"
import {
    getDownloadMetadataStoreFromDatabase,
    replaceDownloadMetadataStoreInDatabase,
} from "../repositories/downloadMetadataRepository.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

let downloadMetadataCache: DownloadsMetadataStore = {}
let initialized = false
let saveDownloadMetadataChain: Promise<void> = Promise.resolve()

function cloneStore(store: DownloadsMetadataStore): DownloadsMetadataStore {
    return typeof structuredClone === "function"
        ? structuredClone(store)
        : (JSON.parse(JSON.stringify(store)) as DownloadsMetadataStore)
}

/** Loads download metadata from the database into the in-memory cache. */
export async function initializeDownloadMetadataStore(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    try {
        const loaded = await getDownloadMetadataStoreFromDatabase()
        downloadMetadataCache = loaded
        initialized = true
        logger.info(
            `[downloadMetadata] Loaded ${Object.keys(downloadMetadataCache).length} metadata entries from database.`
        )
    } catch (error: unknown) {
        logger.error("[downloadMetadata] Failed to load metadata from database:", error)
        initialized = false
        throw error
    }
}

async function withDownloadMetadataSaveLock<T>(work: () => Promise<T>): Promise<T> {
    let release: () => void = () => {}
    const previous = saveDownloadMetadataChain
    saveDownloadMetadataChain = new Promise<void>((resolve) => {
        release = resolve
    })
    await previous
    try {
        return await work()
    } finally {
        release()
    }
}

export type SaveDownloadMetadataStoreOptions = {
    /** Store keys removed from the in-memory map (cleanup); must be listed explicitly. */
    deleteStoreKeys?: string[]
}

/** Returns a clone of the metadata cache so callers cannot mutate shared state. */
export function getDownloadMetadataStore(): DownloadsMetadataStore {
    if (!initialized) {
        throw new Error("Download metadata store not initialized")
    }
    return cloneStore(downloadMetadataCache)
}

/** Persists the provided metadata map to the database and replaces the in-memory cache with a deep clone. */
export async function saveDownloadMetadataStore(
    metadata: DownloadsMetadataStore,
    loggerInstance?: Partial<LoggerInterface>,
    options?: SaveDownloadMetadataStoreOptions
): Promise<boolean> {
    const nextCache = cloneStore(metadata)
    const deleteStoreKeys = (options?.deleteStoreKeys ?? []).filter(
        (key) => typeof key === "string" && key.length > 0
    )
    return withDownloadMetadataSaveLock(async () => {
        const logger = loggerFromPartial(loggerInstance)
        const previousCache = cloneStore(downloadMetadataCache)
        try {
            const result = await replaceDownloadMetadataStoreInDatabase(nextCache, {
                deleteStoreKeys,
            })
            try {
                const persistedCache = await getDownloadMetadataStoreFromDatabase()
                downloadMetadataCache = cloneStore(persistedCache)
                initialized = true
            } catch (reloadErr: unknown) {
                logger.warn(
                    "[downloadMetadata] replaceDownloadMetadataStoreInDatabase succeeded but cache reload failed; keeping previous in-memory cache",
                    reloadErr
                )
                downloadMetadataCache = previousCache
                initialized = true
                return false
            }
            if (result.skippedEntries.length > 0) {
                logger.warn(
                    `[downloadMetadata] Skipped ${result.skippedEntries.length} metadata row(s) (no resolvable guild id); cache reloaded from database.`
                )
            }
            logger.debug(
                `[downloadMetadata] Saved metadata store to database (upserted=${result.rowsWritten}, deleted=${result.rowsDeleted}).`
            )
            return result.skippedEntries.length === 0
        } catch (error: unknown) {
            logger.error("[downloadMetadata] Failed saving metadata store to database:", error)
            return false
        }
    })
}

/** Indicates whether the metadata cache has been initialized from the database. */
export function isDownloadMetadataStoreInitialized(): boolean {
    return initialized
}
