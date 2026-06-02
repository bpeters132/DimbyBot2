import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import type {
    DownloadFileMetadata,
    DownloadMetadataStoreSkippedEntry,
    DownloadsMetadataStore,
} from "../types/index.js"
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

export type SkippedDownloadMetadataEntry = DownloadMetadataStoreSkippedEntry

type NormalizedDownloadMetadataRow = {
    fileName: string
    guildId: string
    downloadDate: Date | null
    originalUrl: string | null
    filePath: string | null
}

function normalizedRowsFromStore(store: DownloadsMetadataStore): {
    rows: NormalizedDownloadMetadataRow[]
    skippedEntries: SkippedDownloadMetadataEntry[]
} {
    const skippedEntries: SkippedDownloadMetadataEntry[] = []
    const byGuildFile = new Map<
        string,
        {
            row: NormalizedDownloadMetadataRow
            sourceKey: string
        }
    >()

    for (const [key, metadata] of Object.entries(store)) {
        if (!metadata || typeof metadata !== "object") continue
        const parsed = parseDownloadMetadataStoreKey(key)
        const fileName = parsed.fileName
        const guildId = effectiveDownloadMetadataGuildId(key, metadata)
        if (guildId === null) {
            console.debug("[downloadMetadata] skipping store row (no resolvable guildId)", {
                key,
                fileName: parsed.fileName,
                downloadDate: metadata.downloadDate,
            })
            skippedEntries.push({ key, reason: "unresolvable-guild-id", fileName })
            continue
        }
        const parsedDownloadDate =
            metadata.downloadDate == null ? null : new Date(metadata.downloadDate)
        const downloadDate =
            parsedDownloadDate && Number.isFinite(parsedDownloadDate.getTime())
                ? parsedDownloadDate
                : null
        const row: NormalizedDownloadMetadataRow = {
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

    return { rows: Array.from(byGuildFile.values()).map((e) => e.row), skippedEntries }
}

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

function deleteConditionsForStoreKeys(
    deleteStoreKeys: string[]
): Prisma.DownloadMetadataWhereInput[] {
    const conditions: Prisma.DownloadMetadataWhereInput[] = []
    const seen = new Set<string>()
    for (const storeKey of deleteStoreKeys) {
        if (typeof storeKey !== "string" || !storeKey.trim()) continue
        const parsed = parseDownloadMetadataStoreKey(storeKey)
        const dedupe =
            parsed.guildId !== null && parsed.guildId.length > 0
                ? `${parsed.guildId}|${parsed.fileName}`
                : `|${parsed.fileName}`
        if (seen.has(dedupe)) continue
        seen.add(dedupe)
        // Only delete by composite `(guildId, fileName)`. A filename-only key (parsed.guildId null/empty)
        // would translate to `{ fileName }`, matching that fileName across EVERY guild and wiping
        // unrelated guilds' rows. DB rows always carry a guildId (NULL legacy rows were migrated to the
        // UNKNOWN sentinel), so callers' keys from downloadMetadataKeysForFile are composite — the
        // filename-only branch targets no real row precisely and is intentionally skipped here.
        if (parsed.guildId !== null && parsed.guildId.length > 0) {
            conditions.push({ guildId: parsed.guildId, fileName: parsed.fileName })
        }
    }
    return conditions
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
        if (skippedEntries.length > 0) {
            return { rowsWritten: 0, rowsDeleted: 0, skippedEntries }
        }
        await prisma.downloadMetadata.deleteMany({})
        return { rowsWritten: 0, rowsDeleted: 0, skippedEntries }
    }

    const UPSERT_BATCH = 32
    let rowsDeleted = 0

    await prisma.$transaction(async (tx) => {
        const deleteConditions = deleteConditionsForStoreKeys(deleteStoreKeys)
        if (deleteConditions.length > 0) {
            const deleted = await tx.downloadMetadata.deleteMany({
                where: { OR: deleteConditions },
            })
            rowsDeleted = deleted.count
        }

        for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
            const batch = rows.slice(i, i + UPSERT_BATCH)
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

    return { rowsWritten: rows.length, rowsDeleted, skippedEntries }
}
