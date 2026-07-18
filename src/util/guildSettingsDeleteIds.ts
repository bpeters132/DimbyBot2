import type { GuildSettingsStore } from "../types/index.js"

/**
 * Builds the guild IDs that must be deleted from the database after a settings merge.
 *
 * Explicit `deleteGuildIds` are filtered so stale callers cannot wipe rows that still have
 * fields after merge. Touched guilds that became empty after `clearedGuildFields` are always
 * included — callers may omit `deleteGuildIds` once fields are cleared.
 */
export function resolveGuildSettingsDeleteIds(
    explicitDeleteGuildIds: string[],
    emptyAfterMergeGuildIds: string[],
    merged: GuildSettingsStore
): string[] {
    const safeExplicit = explicitDeleteGuildIds.filter((guildId) => {
        const row = merged[guildId]
        return row === undefined || Object.keys(row).length === 0
    })
    return [...new Set([...safeExplicit, ...emptyAfterMergeGuildIds])]
}
