import { getPrismaClient } from "../lib/database.js"
import type { DownloadFileMetadata, DownloadsMetadataStore } from "../types/index.js"

function toDownloadMetadataEntry(row: {
    guildId: string | null
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
        const existingRows = await tx.downloadMetadata.findMany({
            select: { fileName: true, downloadDate: true },
        })
        const fileNameSet = new Set(fileNames)
        const toDelete = existingRows.filter((row) => !fileNameSet.has(row.fileName))

        for (const fileName of fileNames) {
            const metadata = store[fileName]
            const parsedDownloadDate =
                metadata?.downloadDate === undefined ? null : new Date(metadata.downloadDate)
            const downloadDate =
                parsedDownloadDate && Number.isFinite(parsedDownloadDate.getTime())
                    ? parsedDownloadDate.toISOString()
                    : null

            await tx.downloadMetadata.upsert({
                where: { fileName },
                create: {
                    fileName,
                    guildId: metadata?.guildId ?? null,
                    downloadDate,
                    originalUrl: metadata?.originalUrl ?? null,
                    filePath: metadata?.filePath ?? null,
                },
                update: {
                    guildId: metadata?.guildId ?? null,
                    downloadDate,
                    originalUrl: metadata?.originalUrl ?? null,
                    filePath: metadata?.filePath ?? null,
                },
            })
        }

        if (toDelete.length > 0) {
            const deleteGuards = toDelete.map((row) => ({
                fileName: row.fileName,
                downloadDate: row.downloadDate,
            }))
            await tx.downloadMetadata.deleteMany({
                where: {
                    OR: deleteGuards,
                },
            })
        }
    })

    return { rowsWritten: fileNames.length }
}
