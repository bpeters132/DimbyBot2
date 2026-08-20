import type {
    DownloadMetadataStoreSkippedEntry,
    DownloadsMetadataStore,
} from "../types/index.js"
import {
    effectiveDownloadMetadataGuildId,
    parseDownloadMetadataStoreKey,
} from "./downloadMetadataKeys.js"

export type SkippedDownloadMetadataEntry = DownloadMetadataStoreSkippedEntry

export type NormalizedDownloadMetadataRow = {
    fileName: string
    guildId: string
    downloadDate: Date | null
    originalUrl: string | null
    filePath: string | null
}

/** Composite `(guildId, fileName)` delete target — never filename-only. */
export type DownloadMetadataDeleteCondition = {
    guildId: string
    fileName: string
}

function storeKeyIsComposite(storeKey: string): boolean {
    const parsed = parseDownloadMetadataStoreKey(storeKey)
    return parsed.guildId !== null && parsed.guildId.length > 0
}

/**
 * Flattens the legacy in-memory metadata map into upsertable DB rows.
 * Skips entries with no resolvable guild (including the UNKNOWN sentinel) and
 * prefers composite store keys when both a composite and legacy key map to the
 * same `(guildId, fileName)`.
 */
export function normalizedRowsFromStore(store: DownloadsMetadataStore): {
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

/**
 * Builds Prisma `deleteMany` OR conditions for intentional store-key deletes.
 * Filename-only keys are skipped so a legacy key cannot wipe the same `fileName`
 * across every guild.
 */
export function deleteConditionsForStoreKeys(
    deleteStoreKeys: string[]
): DownloadMetadataDeleteCondition[] {
    const conditions: DownloadMetadataDeleteCondition[] = []
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
