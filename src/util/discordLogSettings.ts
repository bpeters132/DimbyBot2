import type { GuildDiscordLogSettings, GuildSettings, GuildSettingsStore } from "../types/index.js"
import type { SaveGuildSettingsOptions } from "./saveControlChannel.js"

/**
 * Drops empty `byLevel` maps and returns `undefined` when no discord-log fields remain,
 * so callers can delete the key instead of persisting an empty object.
 */
export function normalizeDiscordLog(
    cfg: GuildDiscordLogSettings
): GuildDiscordLogSettings | undefined {
    const out: GuildDiscordLogSettings = { ...cfg }
    if (out.byLevel) {
        const entries = Object.entries(out.byLevel).filter(([, id]) => Boolean(id))
        if (entries.length === 0) {
            delete out.byLevel
        } else {
            out.byLevel = Object.fromEntries(entries) as GuildDiscordLogSettings["byLevel"]
        }
    }
    if (!out.allChannelId && !out.byLevel && out.minLevel === undefined) {
        return undefined
    }
    return out
}

/** Writes normalized `next` to `guildRow.discordLog`, or removes the key if empty. */
export function applyNormalizedDiscordLog(
    next: GuildDiscordLogSettings,
    guildRow: GuildSettings
): void {
    const normalized = normalizeDiscordLog(next)
    if (normalized) {
        guildRow.discordLog = normalized
    } else {
        delete guildRow.discordLog
    }
}

/** Copy of `discordLog` safe to mutate without affecting the live settings cache. */
export function detachGuildDiscordLog(
    cfg: GuildDiscordLogSettings | undefined
): GuildDiscordLogSettings {
    if (!cfg) {
        return {}
    }
    return {
        ...cfg,
        byLevel: cfg.byLevel ? { ...cfg.byLevel } : undefined,
    }
}

/** Copy of a guild row safe to mutate (detached `discordLog` / `byLevel`). */
export function detachGuildRow(row: GuildSettings | undefined): GuildSettings {
    if (!row) {
        return {}
    }
    const out: GuildSettings = { ...row }
    if (row.discordLog) {
        out.discordLog = detachGuildDiscordLog(row.discordLog)
    }
    return out
}

/** New store map with this guild’s row replaced; drops the guild key if `row` is empty. */
export function storeWithGuildRow(
    store: GuildSettingsStore,
    guildId: string,
    row: GuildSettings
): GuildSettingsStore {
    const next: GuildSettingsStore = { ...store }
    if (Object.keys(row).length === 0) {
        delete next[guildId]
    } else {
        next[guildId] = row
    }
    return next
}

/** Guild keys removed from the store map (explicit DB deletes — not inferred from stale snapshots). */
export function guildIdsRemovedFromStore(
    before: GuildSettingsStore,
    after: GuildSettingsStore
): string[] {
    return Object.keys(before).filter((id) => !(id in after))
}

/** Save options for a single-guild edit; clears `discordLog` when it was removed from the working row. */
export function guildSettingsSaveOptions(
    guildId: string,
    before: GuildSettingsStore,
    afterStore: GuildSettingsStore,
    workingRow: GuildSettings
): SaveGuildSettingsOptions {
    const options: SaveGuildSettingsOptions = {
        deleteGuildIds: guildIdsRemovedFromStore(before, afterStore),
        touchedGuildIds: [guildId],
    }
    if (before[guildId]?.discordLog && !workingRow.discordLog) {
        options.clearedGuildFields = { [guildId]: ["discordLog"] }
    }
    return options
}
