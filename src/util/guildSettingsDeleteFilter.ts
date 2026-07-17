import type { GuildSettingsStore } from "../types/index.js"

/**
 * Returns delete targets that are safe after a settings merge: only guilds with an empty
 * or absent row. Callers that pass stale `deleteGuildIds` from a partial local snapshot must
 * not wipe rows another concurrent save just wrote.
 */
export function guildIdsEligibleForSettingsDelete(
    deleteGuildIds: string[],
    merged: GuildSettingsStore
): string[] {
    return deleteGuildIds.filter((guildId) => {
        const row = merged[guildId]
        return row === undefined || Object.keys(row).length === 0
    })
}
