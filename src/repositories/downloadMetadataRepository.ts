import { getPrismaClient } from "../lib/database.js"
import type { DownloadFileMetadata, DownloadsMetadataStore } from "../types/index.js"
import {
    downloadMetadataStoreKey,
    effectiveDownloadMetadataGuildId,
    parseDownloadMetadataStoreKey,
} from "../util/downloadMetadataKeys.js"

function toDownloadMetadataEntry(row: {
    guildId: string
    downloadDate: Date | string | null
    originalUrl: string | null
    filePath: string | null
}): DownloadFileMetadata {
    const entry: DownloadFileMetadata = {}
    if (row.guildId) entry.guildId = row.guildId
    if (row.downloadDate) {
        const parsedDate =
            row.downloadDate instanceof Date ? row.downloadDate : new Date(row.downloadDate)
        if (Number.isFinite(parsedDate.getTime())) {
            entry.downloadDate = parsedDate.toISOString()
        }
    }
    if (row.originalUrl) entry.originalUrl = row.originalUrl
    if (row.filePath) entry.filePath = row.filePath
    return entry
}

function normalizedRowsFromStore(store: DownloadsMetadataStore) {
    const rows: Array<{
        fileName: string
        guildId: string
        downloadDate: Date | null
        originalUrl: string | null
        filePath: string | null
    }> = []

    for (const [key, metadata] of Object.entries(store)) {
        if (!metadata || typeof metadata !== "object") continue
        const parsed = parseDownloadMetadataStoreKey(key)
        const fileName = parsed.fileName
        const guildId = effectiveDownloadMetadataGuildId(key, metadata)
        const parsedDownloadDate =
            metadata.downloadDate === undefined ? null : new Date(metadata.downloadDate)
        const downloadDate =
            parsedDownloadDate && Number.isFinite(parsedDownloadDate.getTime())
                ? parsedDownloadDate
                : null
        rows.push({
            fileName,
            guildId,
            downloadDate,
            originalUrl: metadata.originalUrl ?? null,
            filePath: metadata.filePath ?? null,
        })
    }

    return rows
}

/** Reads all download metadata rows and returns the legacy map shape keyed by composite store key. */
export async function getDownloadMetadataStoreFromDatabase(): Promise<DownloadsMetadataStore> {
    const prisma = getPrismaClient()
    const rows = await prisma.downloadMetadata.findMany()
    return rows.reduce<DownloadsMetadataStore>((acc, row) => {
        const guildId = row.guildId ?? ""
        const key = downloadMetadataStoreKey(guildId, row.fileName)
        acc[key] = toDownloadMetadataEntry({ ...row, guildId })
        return acc
    }, {})
}

/** Returns whether the download metadata table has no rows. */
export async function isDownloadMetadataTableEmpty(): Promise<boolean> {
    const prisma = getPrismaClient()
    const count = await prisma.downloadMetadata.count()
    return count === 0
}

/**
 * Replaces all download metadata rows with the provided map (full replace via delete + createMany).
 */
export async function replaceDownloadMetadataStoreInDatabase(
    store: DownloadsMetadataStore
): Promise<{ rowsWritten: number }> {
    const prisma = getPrismaClient()
    const rows = normalizedRowsFromStore(store)

    await prisma.$transaction(async (tx) => {
        await tx.downloadMetadata.deleteMany({})
        if (rows.length > 0) {
            await tx.downloadMetadata.createMany({ data: rows })
        }
    })

    return { rowsWritten: rows.length }
}
