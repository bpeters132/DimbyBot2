import type { GuildSettingsStore } from "../types/index.js"
import { resolveGuildSettingsDeleteIds } from "./guildSettingsDeleteIds.js"

/**
 * Returns delete targets that are safe after a settings merge: only guilds with an empty
 * or absent row. Callers that pass stale `deleteGuildIds` from a partial local snapshot must
 * not wipe rows another concurrent save just wrote.
 */
export function guildIdsEligibleForSettingsDelete(
    deleteGuildIds: string[],
    merged: GuildSettingsStore
): string[] {
    return resolveGuildSettingsDeleteIds(deleteGuildIds, [], merged)
}
