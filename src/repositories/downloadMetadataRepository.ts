import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import type { DownloadMetadataStoreSkippedEntry, DownloadsMetadataStore } from "../types/index.js"
import {
    downloadMetadataStoreKey,
    parseDownloadMetadataStoreKey,
} from "../util/downloadMetadataKeys.js"
import {
    deleteConditionsForStoreKeys,
    normalizedRowsFromStore,
    toDownloadMetadataEntry,
} from "../util/downloadMetadataNormalize.js"

export type SkippedDownloadMetadataEntry = DownloadMetadataStoreSkippedEntry

/** Reads all download metadata rows and returns the legacy map shape keyed by composite store key. */
export async function getDownloadMetadataStoreFromDatabase(): Promise<DownloadsMetadataStore> {
    const prisma = getPrismaClient()
    const rows = await prisma.downloadMetadata.findMany()
    return rows.reduce<DownloadsMetadataStore>((acc, row) => {
        const guildId = row.guildId?.trim() ?? ""
        const key =
            guildId.length > 0 ? downloadMetadataStoreKey(guildId, row.fileName) : row.fileName
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
export type ReplaceDownloadMetadataStoreResult = {
    rowsWritten: number
    rowsDeleted: number
    skippedEntries: SkippedDownloadMetadataEntry[]
}

export type ReplaceDownloadMetadataStoreOptions = {
    /** Store keys removed intentionally (cleanup); never inferred from snapshot omissions. */
    deleteStoreKeys?: string[]
}

export async function replaceDownloadMetadataStoreInDatabase(
    store: DownloadsMetadataStore,
    options?: ReplaceDownloadMetadataStoreOptions
): Promise<ReplaceDownloadMetadataStoreResult> {
    const prisma = getPrismaClient()
    const { rows, skippedEntries } = normalizedRowsFromStore(store)

    const deleteStoreKeys = (options?.deleteStoreKeys ?? []).filter(
        (key) => typeof key === "string" && key.length > 0
    )

    if (rows.length === 0 && deleteStoreKeys.length === 0) {
        return { rowsWritten: 0, rowsDeleted: 0, skippedEntries }
    }

    const UPSERT_BATCH = 32
    let rowsDeleted = 0

    // Never upsert rows that were explicitly deleted in this call — callers may still pass a
    // full db snapshot that still contains those keys (delete-then-resurrect bug).
    const deletedGuildFileKeys = new Set<string>()
    for (const storeKey of deleteStoreKeys) {
        const parsed = parseDownloadMetadataStoreKey(storeKey)
        if (parsed.guildId !== null && parsed.guildId.length > 0) {
            deletedGuildFileKeys.add(`${parsed.guildId}|${parsed.fileName}`)
        }
    }
    const rowsToWrite =
        deletedGuildFileKeys.size === 0
            ? rows
            : rows.filter((row) => !deletedGuildFileKeys.has(`${row.guildId}|${row.fileName}`))

    await prisma.$transaction(async (tx) => {
        const deleteConditions: Prisma.DownloadMetadataWhereInput[] =
            deleteConditionsForStoreKeys(deleteStoreKeys)
        if (deleteConditions.length > 0) {
            const deleted = await tx.downloadMetadata.deleteMany({
                where: { OR: deleteConditions },
            })
            rowsDeleted = deleted.count
        }

        for (let i = 0; i < rowsToWrite.length; i += UPSERT_BATCH) {
            const batch = rowsToWrite.slice(i, i + UPSERT_BATCH)
            const existingBefore = await tx.downloadMetadata.findMany({
                where: {
                    OR: batch.map((row) => ({
                        fileName: row.fileName,
                        guildId: row.guildId,
                    })),
                },
                select: { fileName: true, guildId: true },
            })

            await tx.downloadMetadata.createMany({
                data: batch,
                skipDuplicates: true,
            })

            const existingKeys = new Set(
                existingBefore.map((row) => downloadMetadataStoreKey(row.guildId, row.fileName))
            )
            for (const row of batch) {
                const key = downloadMetadataStoreKey(row.guildId, row.fileName)
                if (!existingKeys.has(key)) continue
                await tx.downloadMetadata.update({
                    where: {
                        fileName_guildId: { fileName: row.fileName, guildId: row.guildId },
                    },
                    data: {
                        downloadDate: row.downloadDate,
                        originalUrl: row.originalUrl,
                        filePath: row.filePath,
                    },
                })
            }
        }
    })

    return { rowsWritten: rowsToWrite.length, rowsDeleted, skippedEntries }
}
