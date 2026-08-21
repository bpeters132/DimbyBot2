import type { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import { normalizeOptionalDiscordSnowflake } from "../shared/discord-snowflake.js"
import type { GuildSettings, GuildSettingsStore } from "../types/index.js"
import {
    normalizeDiscordLogForDatabase,
    parseGuildDiscordLog,
} from "../util/guildDiscordLogPersist.js"

function toGuildSettingsStoreEntry(row: {
    controlChannelId: string | null
    controlMessageId: string | null
    downloadsMaxMb: number | null
    discordLog: Prisma.JsonValue | null
}): GuildSettings {
    const entry: GuildSettings = {}
    if (row.controlChannelId) entry.controlChannelId = row.controlChannelId
    if (row.controlMessageId) entry.controlMessageId = row.controlMessageId
    if (typeof row.downloadsMaxMb === "number") entry.downloadsMaxMb = row.downloadsMaxMb
    const discordLog = parseGuildDiscordLog(row.discordLog)
    if (discordLog) entry.discordLog = discordLog
    return entry
}

/** Reads all guild settings rows and returns the legacy map shape. */
export async function getGuildSettingsStoreFromDatabase(): Promise<GuildSettingsStore> {
    const prisma = getPrismaClient()
    const rows = await prisma.guildSettings.findMany()
    return rows.reduce<GuildSettingsStore>((acc, row) => {
        acc[row.guildId] = toGuildSettingsStoreEntry(row)
        return acc
    }, {})
}

/** Returns whether the guild settings table has no rows. */
export async function isGuildSettingsTableEmpty(): Promise<boolean> {
    const prisma = getPrismaClient()
    const count = await prisma.guildSettings.count()
    return count === 0
}

export type ReplaceGuildSettingsOptions = {
    /** Guild rows to remove explicitly (e.g. control-channel unset). Never inferred from snapshot keys. */
    deleteGuildIds?: string[]
}

/** Upserts guild settings rows from the legacy map shape; optional explicit per-guild deletes only. */
export async function replaceGuildSettingsStoreInDatabase(
    store: GuildSettingsStore,
    options?: ReplaceGuildSettingsOptions
): Promise<{ rowsUpserted: number; rowsDeleted: number; rowsAffected: number }> {
    const prisma = getPrismaClient()
    const guildIds = Object.keys(store)
    const deleteGuildIds = (options?.deleteGuildIds ?? []).filter(
        (id) => typeof id === "string" && id.length > 0
    )

    const { rowsUpserted, rowsDeleted, rowsAffected } = await prisma.$transaction(async (tx) => {
        let count = 0
        for (const guildId of guildIds) {
            const settings = store[guildId]
            const payload = {
                controlChannelId: normalizeOptionalDiscordSnowflake(settings?.controlChannelId),
                controlMessageId: normalizeOptionalDiscordSnowflake(settings?.controlMessageId),
                downloadsMaxMb:
                    typeof settings?.downloadsMaxMb === "number" ? settings.downloadsMaxMb : null,
                discordLog: normalizeDiscordLogForDatabase(settings?.discordLog),
            }
            await tx.guildSettings.upsert({
                where: { guildId },
                create: {
                    guildId,
                    ...payload,
                },
                update: payload,
            })
            count += 1
        }

        const deleted =
            deleteGuildIds.length > 0
                ? await tx.guildSettings.deleteMany({
                      where: { guildId: { in: deleteGuildIds } },
                  })
                : { count: 0 }
        return {
            rowsUpserted: count,
            rowsDeleted: deleted.count,
            rowsAffected: count + deleted.count,
        }
    })

    return { rowsUpserted, rowsDeleted, rowsAffected }
}
