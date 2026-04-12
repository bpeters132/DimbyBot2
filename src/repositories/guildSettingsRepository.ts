import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import type { GuildDiscordLogSettings, GuildSettings, GuildSettingsStore } from "../types/index.js"

function parseGuildDiscordLog(value: Prisma.JsonValue | null): GuildDiscordLogSettings | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined
    }
    return value as GuildDiscordLogSettings
}

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

/** Replaces all guild settings rows with the provided legacy map shape. */
export async function replaceGuildSettingsStoreInDatabase(
    store: GuildSettingsStore
): Promise<{ rowsWritten: number }> {
    const prisma = getPrismaClient()
    const guildIds = Object.keys(store)

    const rowsWritten = await prisma.$transaction(async (tx) => {
        let count = 0
        for (const guildId of guildIds) {
            const settings = store[guildId]
            const payload = {
                controlChannelId: settings?.controlChannelId ?? null,
                controlMessageId: settings?.controlMessageId ?? null,
                downloadsMaxMb:
                    typeof settings?.downloadsMaxMb === "number" ? settings.downloadsMaxMb : null,
                discordLog:
                    settings?.discordLog != null
                        ? (settings.discordLog as Prisma.InputJsonValue)
                        : Prisma.DbNull,
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

        const deleted = await tx.guildSettings.deleteMany({
            where: {
                guildId: {
                    notIn: guildIds.length > 0 ? guildIds : ["__never__"],
                },
            },
        })
        return count + deleted.count
    })

    return { rowsWritten }
}
