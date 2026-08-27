/**
 * Pure helpers for download-metadata JSON→DB migration outcomes.
 * Kept separate so BotClient abort policy stays unit-testable without Prisma.
 */

/** BotClient aborts when migration `failedCount > 0`. Write skips must not count. */
export function downloadMetadataMigrationShouldAbortStartup(args: {
    validationFailedCount: number
    writeSkippedCount: number
}): boolean {
    // Intentionally ignore writeSkippedCount — UNKNOWN / unresolvable guild ids are
    // skipped by normalize and must not brick startup on an empty metadata table.
    void args.writeSkippedCount
    return args.validationFailedCount > 0
}

/** Whether the source JSON may be renamed to `.migrated` after a write attempt. */
export function shouldRenameDownloadMetadataJsonAfterWrite(args: {
    rowsWritten: number
    skippedEntries: number
}): boolean {
    if (args.skippedEntries === 0) return true
    // All rows unresolvable: rename so empty-table startups do not loop forever.
    return args.rowsWritten === 0
}
