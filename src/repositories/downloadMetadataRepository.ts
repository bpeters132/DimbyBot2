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
    skippedEntries: SkippedDownloadMetadataEntry[]
}

export async function replaceDownloadMetadataStoreInDatabase(
    store: DownloadsMetadataStore
): Promise<ReplaceDownloadMetadataStoreResult> {
    const prisma = getPrismaClient()
    const { rows, skippedEntries } = normalizedRowsFromStore(store)

    if (rows.length === 0) {
        if (skippedEntries.length > 0) {
            return { rowsWritten: 0, skippedEntries }
        }
        await prisma.downloadMetadata.deleteMany({})
        return { rowsWritten: 0, skippedEntries }
    }

    const UPSERT_BATCH = 32
    const KEEP_INSERT_CHUNK = 500

    await prisma.$transaction(async (tx) => {
        // PostgreSQL-specific temp table lifecycle (`ON COMMIT DROP`) is intentional; this project is
        // configured for PostgreSQL via Prisma, and `_dimbybot_dm_keep` must be transaction-scoped.
        await tx.$executeRaw`
            CREATE TEMP TABLE _dimbybot_dm_keep (
                "guildId" TEXT NOT NULL,
                "fileName" TEXT NOT NULL
            ) ON COMMIT DROP
        `

        for (let i = 0; i < rows.length; i += KEEP_INSERT_CHUNK) {
            const batch = rows.slice(i, i + KEEP_INSERT_CHUNK)
            const tuples = batch.map((r) => Prisma.sql`(${r.guildId}, ${r.fileName})`)
            await tx.$executeRaw`
                INSERT INTO _dimbybot_dm_keep ("guildId", "fileName")
                VALUES ${Prisma.join(tuples, ", ")}
            `
        }

        if (skippedEntries.length === 0) {
            await tx.$executeRaw`
                DELETE FROM "DownloadMetadata" AS d
                WHERE NOT EXISTS (
                    SELECT 1 FROM _dimbybot_dm_keep k
                    WHERE k."guildId" = d."guildId" AND k."fileName" = d."fileName"
                )
            `
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

    return { rowsWritten: rows.length, skippedEntries }
}
