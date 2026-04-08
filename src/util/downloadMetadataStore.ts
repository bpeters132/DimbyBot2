import type { DownloadsMetadataStore, LoggerInterface } from "../types/index.js"
import {
    getDownloadMetadataStoreFromDatabase,
    replaceDownloadMetadataStoreInDatabase,
} from "../repositories/downloadMetadataRepository.js"

let downloadMetadataCache: DownloadsMetadataStore = {}
let initialized = false

function getLogger(loggerInstance: Partial<LoggerInterface> | undefined): LoggerInterface {
    if (
        loggerInstance &&
        typeof loggerInstance.debug === "function" &&
        typeof loggerInstance.info === "function" &&
        typeof loggerInstance.warn === "function" &&
        typeof loggerInstance.error === "function"
    ) {
        const logger = loggerInstance as Partial<LoggerInterface>
        return {
            debug: (text: string, ...args: unknown[]) => logger.debug!(text, ...args),
            info: (text: string, ...args: unknown[]) => logger.info!(text, ...args),
            warn: (text: string, ...args: unknown[]) => logger.warn!(text, ...args),
            error: (text: string, ...args: unknown[]) => logger.error!(text, ...args),
            setDebugEnabled:
                typeof logger.setDebugEnabled === "function"
                    ? logger.setDebugEnabled.bind(logger)
                    : () => {},
            getDebugEnabled:
                typeof logger.getDebugEnabled === "function"
                    ? logger.getDebugEnabled.bind(logger)
                    : () => false,
            getLogFilePath:
                typeof logger.getLogFilePath === "function"
                    ? logger.getLogFilePath.bind(logger)
                    : () => null,
        }
    }
    return {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        setDebugEnabled: () => {},
        getDebugEnabled: () => false,
        getLogFilePath: () => null,
    }
}

/** Loads download metadata from the database into the in-memory cache. */
export async function initializeDownloadMetadataStore(
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = getLogger(loggerInstance)
    const loaded = await getDownloadMetadataStoreFromDatabase()
    downloadMetadataCache = loaded
    initialized = true
    logger.info(
        `[downloadMetadata] Loaded ${Object.keys(downloadMetadataCache).length} metadata entries from database.`
    )
}

/** Returns the mutable metadata cache used by command handlers and utilities. */
export function getDownloadMetadataStore(): DownloadsMetadataStore {
    return downloadMetadataCache
}

/** Persists the provided metadata map to the database and updates the in-memory cache. */
export async function saveDownloadMetadataStore(
    metadata: DownloadsMetadataStore,
    loggerInstance?: Partial<LoggerInterface>
): Promise<boolean> {
    const logger = getLogger(loggerInstance)
    try {
        const result = await replaceDownloadMetadataStoreInDatabase(metadata)
        downloadMetadataCache = metadata
        initialized = true
        logger.debug(
            `[downloadMetadata] Saved metadata store to database (${result.rowsWritten} rows).`
        )
        return true
    } catch (error: unknown) {
        logger.error("[downloadMetadata] Failed saving metadata store to database:", error)
        return false
    }
}

/** Indicates whether the metadata cache has been initialized from the database. */
export function isDownloadMetadataStoreInitialized(): boolean {
    return initialized
}
