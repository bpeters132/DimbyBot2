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

function isGuildSettingFieldKey(key: string): key is keyof GuildSettings {
    return (GUILD_SETTING_FIELD_KEYS as string[]).includes(key)
}

/**
 * Filters `row` to only the listed guild-setting keys (drops unrelated stale fields from full-row
 * RMW snapshots). Unknown keys are ignored.
 */
export function pickGuildSettingsFields(
    row: GuildSettings | undefined,
    fields: readonly (keyof GuildSettings)[]
): GuildSettings {
    if (!row) return {}
    const out: GuildSettings = {}
    for (const key of fields) {
        if (!isGuildSettingFieldKey(key)) continue
        if (!(key in row)) continue
        const value = row[key]
        if (value === undefined) continue
        switch (key) {
            case "controlChannelId":
            case "controlMessageId":
                out[key] = value as string
                break
            case "downloadsMaxMb":
                out.downloadsMaxMb = value as number
                break
            case "discordLog":
                out.discordLog = value as GuildSettings["discordLog"]
                break
        }
    }
    return out
}

/**
 * Merges only fields present in `snapshotRow` onto `dbRow`, then removes `clearedFields`.
 * Omitted snapshot fields keep their latest database values (prevents cross-field clobber races).
 *
 * When `touchedFields` is set, only those keys are read from `snapshotRow` — callers that pass a
 * full guild row (common after `getGuildSettings()` + mutate one field) must list the fields they
 * intend to write, or concurrent clears of other fields are silently undone.
 */
export function mergeGuildSettingsRow(
    dbRow: GuildSettings | undefined,
    snapshotRow: GuildSettings | undefined,
    clearedFields: (keyof GuildSettings)[] = [],
    touchedFields?: readonly (keyof GuildSettings)[]
): GuildSettings {
    const merged: GuildSettings = dbRow ? cloneGuildSettingsRow(dbRow) : {}
    const applyRow =
        snapshotRow && touchedFields !== undefined
            ? pickGuildSettingsFields(snapshotRow, touchedFields)
            : snapshotRow
    if (applyRow) {
        for (const key of GUILD_SETTING_FIELD_KEYS) {
            if (key in applyRow) {
                const value = applyRow[key]
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
