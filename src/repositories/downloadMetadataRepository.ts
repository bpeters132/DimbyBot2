import { getPrismaClient } from "../lib/database.js"
import type { DownloadFileMetadata, DownloadsMetadataStore } from "../types/index.js"

function toDownloadMetadataEntry(row: {
    guildId: string | null
    downloadDate: string | null
    originalUrl: string | null
    filePath: string | null
}): DownloadFileMetadata {
    const entry: DownloadFileMetadata = {}
    if (row.guildId) entry.guildId = row.guildId
    if (row.downloadDate) entry.downloadDate = row.downloadDate
    if (row.originalUrl) entry.originalUrl = row.originalUrl
    if (row.filePath) entry.filePath = row.filePath
    return entry
}

/** Reads all download metadata rows and returns the legacy map shape keyed by file name. */
export async function getDownloadMetadataStoreFromDatabase(): Promise<DownloadsMetadataStore> {
    const prisma = getPrismaClient()
    const rows = await prisma.downloadMetadata.findMany()
    return rows.reduce<DownloadsMetadataStore>((acc, row) => {
        acc[row.fileName] = toDownloadMetadataEntry(row)
        return acc
    }, {})
}

/** Returns whether the download metadata table has no rows. */
export async function isDownloadMetadataTableEmpty(): Promise<boolean> {
    const prisma = getPrismaClient()
    const count = await prisma.downloadMetadata.count()
    return count === 0
}

/** Replaces all download metadata rows with the provided legacy map shape. */
export async function replaceDownloadMetadataStoreInDatabase(
    store: DownloadsMetadataStore
): Promise<{ rowsWritten: number }> {
    const prisma = getPrismaClient()
    const fileNames = Object.keys(store)

    await prisma.$transaction(async (tx) => {
        await tx.downloadMetadata.deleteMany()
        if (fileNames.length === 0) {
            return
        }

        await tx.downloadMetadata.createMany({
            data: fileNames.map((fileName) => ({
                fileName,
                guildId: store[fileName]?.guildId ?? null,
                downloadDate:
                    store[fileName]?.downloadDate === undefined
                        ? null
                        : String(store[fileName]?.downloadDate),
                originalUrl: store[fileName]?.originalUrl ?? null,
                filePath: store[fileName]?.filePath ?? null,
            })),
        })
    })

    return { rowsWritten: fileNames.length }
}
