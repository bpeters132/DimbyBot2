import type { DownloadFileMetadata, DownloadsMetadataStore } from "../types/index.js"

function cloneStore(store: DownloadsMetadataStore): DownloadsMetadataStore {
    return typeof structuredClone === "function"
        ? structuredClone(store)
        : (JSON.parse(JSON.stringify(store)) as DownloadsMetadataStore)
}

function cloneMetadataEntry(entry: DownloadFileMetadata): DownloadFileMetadata {
    return typeof structuredClone === "function"
        ? structuredClone(entry)
        : (JSON.parse(JSON.stringify(entry)) as DownloadFileMetadata)
}

export type MergeDownloadMetadataForSaveOptions = {
    /** Store keys removed intentionally (cleanup); stripped from the merged map before upsert. */
    deleteStoreKeys?: string[]
    /**
     * Store keys to take from `nextCache`. When set, other keys in `nextCache` are ignored and
     * the latest database values are kept (prevents lost updates across concurrent saves).
     */
    touchedStoreKeys?: string[]
}

/**
 * Builds the in-memory map that should be upserted after an optional delete list.
 *
 * When only `deleteStoreKeys` is set, starts from `dbStore` and drops those keys so a later
 * full-store upsert cannot resurrect rows that were just deleted in the same transaction.
 */
export function mergeDownloadMetadataForSave(
    dbStore: DownloadsMetadataStore,
    nextCache: DownloadsMetadataStore,
    options?: MergeDownloadMetadataForSaveOptions
): DownloadsMetadataStore {
    const deleteStoreKeys = (options?.deleteStoreKeys ?? []).filter(
        (key) => typeof key === "string" && key.length > 0
    )
    const hasTouchedOption = options?.touchedStoreKeys !== undefined
    const touchedStoreKeys = (options?.touchedStoreKeys ?? []).filter(
        (key) => typeof key === "string" && key.length > 0
    )

    const merged = cloneStore(dbStore)
    if (hasTouchedOption) {
        for (const key of touchedStoreKeys) {
            const row = nextCache[key]
            if (row !== undefined) {
                merged[key] = cloneMetadataEntry(row)
            } else {
                // Touched key absent from the snapshot — drop it so upsert cannot resurrect.
                delete merged[key]
            }
        }
    } else if (deleteStoreKeys.length === 0) {
        for (const [key, row] of Object.entries(nextCache)) {
            if (row !== undefined) {
                merged[key] = cloneMetadataEntry(row)
            }
        }
    }

    for (const key of deleteStoreKeys) {
        delete merged[key]
    }
    return merged
}
