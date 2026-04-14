import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import type {
    DiscordLogLevelName,
    GuildDiscordLogSettings,
    GuildSettings,
    GuildSettingsStore,
} from "../types/index.js"

const LOG_LEVELS: ReadonlySet<DiscordLogLevelName> = new Set(["debug", "info", "warn", "error"])

const DISCORD_SNOWFLAKE_ID_RE = /^\d+$/

/** Trims and keeps only non-empty digit strings suitable for Discord snowflake columns. */
function normalizeOptionalSnowflake(value: unknown): string | null {
    if (typeof value !== "string") return null
    const t = value.trim()
    return DISCORD_SNOWFLAKE_ID_RE.test(t) ? t : null
}

/** Normalizes legacy `discordLog` for Prisma JSON writes (object or JSON string → object; else DbNull). */
function normalizeDiscordLogForDatabase(
    value: unknown
): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === null || value === undefined) return Prisma.DbNull
    if (typeof value === "string") {
        try {
            const parsed: unknown = JSON.parse(value)
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Prisma.InputJsonValue
            }
        } catch {
            /* invalid JSON */
        }
        return Prisma.DbNull
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return value as Prisma.InputJsonValue
    }
    return Prisma.DbNull
}

function isDiscordLogLevelName(v: unknown): v is DiscordLogLevelName {
    return typeof v === "string" && LOG_LEVELS.has(v as DiscordLogLevelName)
}

function parseGuildDiscordLog(value: Prisma.JsonValue | null): GuildDiscordLogSettings | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined
    }
    const raw = value as Record<string, unknown>
    const out: GuildDiscordLogSettings = {}
    if (typeof raw.allChannelId === "string" && raw.allChannelId.trim()) {
        out.allChannelId = raw.allChannelId.trim()
    }
    if (raw.minLevel !== undefined && raw.minLevel !== null) {
        if (isDiscordLogLevelName(raw.minLevel)) {
            out.minLevel = raw.minLevel
        }
    }
    if (raw.byLevel !== undefined && raw.byLevel !== null) {
        if (typeof raw.byLevel === "object" && !Array.isArray(raw.byLevel)) {
            const by: Partial<Record<DiscordLogLevelName, string>> = {}
            for (const [k, v] of Object.entries(raw.byLevel as Record<string, unknown>)) {
                if (!isDiscordLogLevelName(k)) continue
                if (typeof v !== "string" || !v.trim()) continue
                by[k] = v.trim()
            }
            if (Object.keys(by).length > 0) out.byLevel = by
        }
    }
    if (!out.allChannelId && !out.byLevel && !out.minLevel) {
        return undefined
    }
    return out
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
): Promise<{ rowsUpserted: number; rowsDeleted: number; rowsAffected: number }> {
    const prisma = getPrismaClient()
    const guildIds = Object.keys(store)

    const { rowsUpserted, rowsDeleted, rowsAffected } = await prisma.$transaction(async (tx) => {
        let count = 0
        for (const guildId of guildIds) {
            const settings = store[guildId]
            const payload = {
                controlChannelId: normalizeOptionalSnowflake(settings?.controlChannelId),
                controlMessageId: normalizeOptionalSnowflake(settings?.controlMessageId),
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
            guildIds.length === 0
                ? await tx.guildSettings.deleteMany({})
                : await tx.guildSettings.deleteMany({
                      where: {
                          guildId: {
                              notIn: guildIds,
                          },
                      },
                  })
        return {
            rowsUpserted: count,
            rowsDeleted: deleted.count,
            rowsAffected: count + deleted.count,
        }
    })

    return { rowsUpserted, rowsDeleted, rowsAffected }
}
