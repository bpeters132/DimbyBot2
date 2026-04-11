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

function storeKeyIsComposite(storeKey: string): boolean {
    const parsed = parseDownloadMetadataStoreKey(storeKey)
    return parsed.guildId !== null && parsed.guildId.length > 0
}

function normalizedRowsFromStore(store: DownloadsMetadataStore) {
    type NormalizedRow = {
        fileName: string
        guildId: string
        downloadDate: Date | null
        originalUrl: string | null
        filePath: string | null
    }
    const byGuildFile = new Map<
        string,
        {
            row: NormalizedRow
            sourceKey: string
        }
    >()

    for (const [key, metadata] of Object.entries(store)) {
        if (!metadata || typeof metadata !== "object") continue
        const parsed = parseDownloadMetadataStoreKey(key)
        const fileName = parsed.fileName
        const guildId = effectiveDownloadMetadataGuildId(key, metadata)
        if (guildId === null) {
            const urlPreview =
                typeof metadata.originalUrl === "string"
                    ? metadata.originalUrl.slice(0, 120)
                    : undefined
            const pathPreview =
                typeof metadata.filePath === "string" ? metadata.filePath.slice(0, 120) : undefined
            console.debug("[downloadMetadata] skipping store row (no resolvable guildId)", {
                key,
                fileName: parsed.fileName,
                downloadDate: metadata.downloadDate,
                originalUrlPreview: urlPreview,
                filePathPreview: pathPreview,
            })
            continue
        }
        const parsedDownloadDate =
            metadata.downloadDate === undefined ? null : new Date(metadata.downloadDate)
        const downloadDate =
            parsedDownloadDate && Number.isFinite(parsedDownloadDate.getTime())
                ? parsedDownloadDate
                : null
        const row: NormalizedRow = {
            fileName,
            guildId,
            downloadDate,
            originalUrl: metadata.originalUrl ?? null,
            filePath: metadata.filePath ?? null,
        }
        const dedupeKey = `${guildId}|${fileName}`
        const nextComposite = storeKeyIsComposite(key)
        const prev = byGuildFile.get(dedupeKey)
        if (!prev) {
            byGuildFile.set(dedupeKey, { row, sourceKey: key })
            continue
        }
        const prevComposite = storeKeyIsComposite(prev.sourceKey)
        if (nextComposite && !prevComposite) {
            byGuildFile.set(dedupeKey, { row, sourceKey: key })
        }
    }

    return Array.from(byGuildFile.values()).map((e) => e.row)
}

/** Reads all download metadata rows and returns the legacy map shape keyed by composite store key. */
export async function getDownloadMetadataStoreFromDatabase(): Promise<DownloadsMetadataStore> {
    const prisma = getPrismaClient()
    const rows = await prisma.downloadMetadata.findMany()
    return rows.reduce<DownloadsMetadataStore>((acc, row) => {
        const guildId = row.guildId?.trim() ?? ""
        const key =
            guildId.length > 0
                ? downloadMetadataStoreKey(guildId, row.fileName)
                : row.fileName
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
 * Syncs download metadata to match the provided map without emptying the table first (avoids a
 * brief full-table gap visible to concurrent readers).
 */
export async function replaceDownloadMetadataStoreInDatabase(
    store: DownloadsMetadataStore
): Promise<{ rowsWritten: number }> {
    const prisma = getPrismaClient()
    const rows = normalizedRowsFromStore(store)

    await prisma.$transaction(async (tx) => {
        if (rows.length === 0) {
            await tx.downloadMetadata.deleteMany({})
            return
        }

        await tx.downloadMetadata.deleteMany({
            where: {
                NOT: {
                    OR: rows.map((r) => ({
                        fileName: r.fileName,
                        guildId: r.guildId,
                    })),
                },
            },
        })

        for (const row of rows) {
            const updated = await tx.downloadMetadata.updateMany({
                where: { fileName: row.fileName, guildId: row.guildId },
                data: {
                    downloadDate: row.downloadDate,
                    originalUrl: row.originalUrl,
                    filePath: row.filePath,
                },
            })
            if (updated.count === 0) {
                await tx.downloadMetadata.create({ data: row })
            }
        }
    })

    return { rowsWritten: rows.length }
}
