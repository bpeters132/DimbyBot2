import type { GuildSettings } from "../types/index.js"

/** Fields that may be written or cleared on a guild settings row. */
export const GUILD_SETTING_FIELD_KEYS: (keyof GuildSettings)[] = [
    "controlChannelId",
    "controlMessageId",
    "downloadsMaxMb",
    "discordLog",
]

function cloneGuildSettingsRow(row: GuildSettings): GuildSettings {
    return typeof structuredClone === "function"
        ? structuredClone(row)
        : (JSON.parse(JSON.stringify(row)) as GuildSettings)
}

/**
 * Merges only fields present in `snapshotRow` onto `dbRow`, then removes `clearedFields`.
 * Omitted snapshot fields keep their latest database values (prevents cross-field clobber races).
 */
export function mergeGuildSettingsRow(
    dbRow: GuildSettings | undefined,
    snapshotRow: GuildSettings | undefined,
    clearedFields: (keyof GuildSettings)[] = []
): GuildSettings {
    const merged: GuildSettings = dbRow ? cloneGuildSettingsRow(dbRow) : {}
    if (snapshotRow) {
        for (const key of GUILD_SETTING_FIELD_KEYS) {
            if (key in snapshotRow) {
                const value = snapshotRow[key]
                if (value !== undefined) {
                    switch (key) {
                        case "controlChannelId":
                        case "controlMessageId":
                            merged[key] = value as string
                            break
                        case "downloadsMaxMb":
                            merged.downloadsMaxMb = value as number
                            break
                        case "discordLog":
                            merged.discordLog = value as GuildSettings["discordLog"]
                            break
                    }
                }
            }
        }
    }
    for (const key of clearedFields) {
        delete merged[key]
    }
    return merged
}
