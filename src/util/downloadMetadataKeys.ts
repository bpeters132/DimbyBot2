import type { LoggerInterface } from "../types/index.js"

/** Unit separator — not used in Discord snowflakes or typical `.wav` names; stable composite store keys. */
export const DOWNLOAD_METADATA_KEY_SEP = "\x1f"

/** DB sentinel for rows that had NULL guildId before composite PK migration; never a real Discord guild. */
export const DOWNLOAD_METADATA_UNKNOWN_GUILD_ID = "UNKNOWN"

/** Builds the in-memory store key for a guild-scoped download row (matches DB composite id). */
export function downloadMetadataStoreKey(guildId: string, fileName: string): string {
    return `${guildId}${DOWNLOAD_METADATA_KEY_SEP}${fileName}`
}

/**
 * Parses a store key into file name and guild id.
 * Legacy keys (plain file name only, no separator) return `guildId: null`.
 */
export function parseDownloadMetadataStoreKey(key: string): {
    guildId: string | null
    fileName: string
} {
    const i = key.indexOf(DOWNLOAD_METADATA_KEY_SEP)
    if (i < 0) {
        return { guildId: null, fileName: key }
    }
    return { guildId: key.slice(0, i), fileName: key.slice(i + DOWNLOAD_METADATA_KEY_SEP.length) }
}

/** Resolves guild id for a store entry (composite key wins, then metadata field). */
export function effectiveDownloadMetadataGuildId(
    storeKey: string,
    meta: { guildId?: string } | undefined
): string | null {
    const parsed = parseDownloadMetadataStoreKey(storeKey)
    if (parsed.guildId !== null && parsed.guildId.length > 0) {
        if (parsed.guildId === DOWNLOAD_METADATA_UNKNOWN_GUILD_ID) {
            return null
        }
        return parsed.guildId
    }
    const fromMeta = meta?.guildId?.trim()
    if (fromMeta) {
        if (fromMeta === DOWNLOAD_METADATA_UNKNOWN_GUILD_ID) {
            return null
        }
        return fromMeta
    }
    return null
}

/** Whether a `.wav` file in the flat downloads directory is associated with the guild in metadata. */
export function downloadMetadataFileBelongsToGuild(
    metadata: Record<string, { guildId?: string } | undefined>,
    fileName: string,
    guildId: string,
    loggerInstance?: Pick<LoggerInterface, "debug">
): boolean {
    const compositeKey = downloadMetadataStoreKey(guildId, fileName)
    if (metadata[compositeKey]) {
        return true
    }
    const legacy = metadata[fileName]
    // TODO(https://github.com/bpeters132/DimbyBot2/issues?q=is%3Aissue+legacy+metadata): legacy fileName-only keys with missing guildId match any guild —
    // misattributes during migration. Populate guildId in migration/reconciliation (target: remove by
    // 2026-07-01 or when tracking issue is closed). Same caveat applies to other legacy fallbacks below.
    if (legacy && (legacy.guildId === undefined || legacy.guildId === "")) {
        loggerInstance?.debug(
            "[download-metadata] legacy guildId missing; cross-guild match possible",
            {
                fileName,
                attemptedGuildId: guildId,
            }
        )
    }
    return Boolean(
        legacy &&
        (legacy.guildId === guildId || legacy.guildId === undefined || legacy.guildId === "")
    )
}

/** Whether a metadata entry targets the guild (composite key, or legacy fileName + guildId rules). */
export function downloadMetadataEntryMatchesGuild(
    key: string,
    info: { guildId?: string } | undefined,
    guildId: string
): boolean {
    if (!info) return false
    const parsed = parseDownloadMetadataStoreKey(key)
    if (parsed.guildId !== null) {
        return parsed.guildId === guildId
    }
    // TODO(https://github.com/bpeters132/DimbyBot2/issues?q=is%3Aissue+legacy+metadata): see downloadMetadataFileBelongsToGuild — reconcile guildId on legacy rows.
    return info.guildId === guildId || info.guildId === undefined || info.guildId === ""
}

/** Store keys to remove for a given file name in a guild (composite and legacy). */
export function downloadMetadataKeysForFile(
    metadata: Record<string, unknown>,
    fileName: string,
    guildId: string
): string[] {
    const keys: string[] = []
    const composite = downloadMetadataStoreKey(guildId, fileName)
    if (composite in metadata) {
        keys.push(composite)
    }
    if (fileName in metadata) {
        const legacy = metadata[fileName] as { guildId?: string } | undefined
        // TODO(https://github.com/bpeters132/DimbyBot2/issues?q=is%3Aissue+legacy+metadata): see downloadMetadataFileBelongsToGuild — reconcile guildId on legacy rows.
        if (
            legacy &&
            (legacy.guildId === guildId || legacy.guildId === undefined || legacy.guildId === "")
        ) {
            keys.push(fileName)
        }
    }
    return keys
}
