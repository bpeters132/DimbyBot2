import type {
    DownloadsMetadataStore,
    LoggerInterface,
    ReplaceDownloadMetadataStoreFn,
} from "../types/index.js"
import {
    getDownloadMetadataStoreFromDatabase,
    replaceDownloadMetadataStoreInDatabase,
} from "../repositories/downloadMetadataRepository.js"
import { mergeDownloadMetadataForSave } from "./downloadMetadataMerge.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

let downloadMetadataCache: DownloadsMetadataStore = {}
let initialized = false
let saveDownloadMetadataChain: Promise<void> = Promise.resolve()

type DownloadMetadataStoreDb = {
    getDownloadMetadataStoreFromDatabase: typeof getDownloadMetadataStoreFromDatabase
    replaceDownloadMetadataStoreInDatabase: ReplaceDownloadMetadataStoreFn
}

let downloadMetadataStoreDb: DownloadMetadataStoreDb = {
    getDownloadMetadataStoreFromDatabase,
    replaceDownloadMetadataStoreInDatabase,
}

function cloneStore(store: DownloadsMetadataStore): DownloadsMetadataStore {
    return typeof structuredClone === "function"
        ? structuredClone(store)
        : (JSON.parse(JSON.stringify(store)) as DownloadsMetadataStore)
}

/** Test-only: replace DB adapters (pass `null` to restore defaults). */
export function setDownloadMetadataStoreDbForTests(
    next: Partial<DownloadMetadataStoreDb> | null
): void {
    downloadMetadataStoreDb = next
        ? {
              getDownloadMetadataStoreFromDatabase:
                  next.getDownloadMetadataStoreFromDatabase ??
                  downloadMetadataStoreDb.getDownloadMetadataStoreFromDatabase,
              replaceDownloadMetadataStoreInDatabase:
                  next.replaceDownloadMetadataStoreInDatabase ??
                  downloadMetadataStoreDb.replaceDownloadMetadataStoreInDatabase,
          }
        : {
              getDownloadMetadataStoreFromDatabase,
              replaceDownloadMetadataStoreInDatabase,
          }
}

/** Test-only: clear cache, init flag, and save lock chain. */
export function resetDownloadMetadataStoreForTests(): void {
    downloadMetadataCache = {}
    initialized = false
    saveDownloadMetadataChain = Promise.resolve()
}

/** Loads download metadata from the database into the in-memory cache. */
export async function initializeDownloadMetadataStore(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    try {
        const loaded = await downloadMetadataStoreDb.getDownloadMetadataStoreFromDatabase()
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
    /**
     * Store keys to take from `metadata` when persisting. When set, other keys in `metadata` are
     * ignored and the latest database values are kept (prevents lost updates across concurrent saves).
     */
    touchedStoreKeys?: string[]
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
    const hasTouchedOption = options?.touchedStoreKeys !== undefined
    const touchedStoreKeys = (options?.touchedStoreKeys ?? []).filter(
        (key) => typeof key === "string" && key.length > 0
    )
    return withDownloadMetadataSaveLock(async () => {
        const logger = loggerFromPartial(loggerInstance)
        try {
            const dbStore = await downloadMetadataStoreDb.getDownloadMetadataStoreFromDatabase()
            // Strip deleteStoreKeys from the upsert map so delete-then-upsert cannot resurrect rows.
            const merged = mergeDownloadMetadataForSave(dbStore, nextCache, {
                deleteStoreKeys,
                touchedStoreKeys: hasTouchedOption ? touchedStoreKeys : undefined,
            })
            const result = await downloadMetadataStoreDb.replaceDownloadMetadataStoreInDatabase(
                merged,
                {
                    deleteStoreKeys,
                }
            )
            try {
                const persistedCache =
                    await downloadMetadataStoreDb.getDownloadMetadataStoreFromDatabase()
                downloadMetadataCache = cloneStore(persistedCache)
                initialized = true
            } catch (reloadErr: unknown) {
                logger.warn(
                    "[downloadMetadata] replaceDownloadMetadataStoreInDatabase succeeded but cache reload failed; using persisted snapshot",
                    reloadErr
                )
                // Omit skipped (unresolvable) keys so the in-memory cache matches what the DB kept.
                const fallback = cloneStore(merged)
                for (const skipped of result.skippedEntries) {
                    delete fallback[skipped.key]
                }
                downloadMetadataCache = fallback
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
