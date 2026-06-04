import { getPrismaClient } from "../lib/database.js"
import type { CountdownEntry, CountdownInput, CountdownStore } from "../types/index.js"

const DISCORD_SNOWFLAKE_ID_RE = /^\d{1,20}$/
const MAX_SNOWFLAKE = (1n << 64n) - 1n

/** Trims and validates a Discord snowflake: must be a positive uint64 digit string. */
function normalizeSnowflake(value: unknown): string | null {
    if (typeof value !== "string") return null
    const t = value.trim()
    if (!DISCORD_SNOWFLAKE_ID_RE.test(t)) return null
    try {
        const n = BigInt(t)
        if (n < 1n || n > MAX_SNOWFLAKE) return null
    } catch {
        return null
    }
    return t
}

/** Maps a Prisma row to the domain {@link CountdownEntry} shape. */
function toCountdownEntry(row: {
    id: number
    guildId: string
    channelId: string
    messageId: string
    eventName: string
    description: string | null
    imageUrl: string | null
    color: number | null
    footer: string | null
    finishMessage: string | null
    mentionRoleId: string | null
    targetTime: Date
    createdBy: string
    createdAt: Date
}): CountdownEntry {
    return {
        id: row.id,
        guildId: row.guildId,
        channelId: row.channelId,
        messageId: row.messageId,
        eventName: row.eventName,
        description: row.description,
        imageUrl: row.imageUrl,
        color: row.color,
        footer: row.footer,
        finishMessage: row.finishMessage,
        mentionRoleId: row.mentionRoleId,
        targetTime: row.targetTime,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
    }
}

/** Reads all countdown rows and returns a map keyed by countdown id. */
export async function getAllCountdownsFromDatabase(): Promise<CountdownStore> {
    const prisma = getPrismaClient()
    const rows = await prisma.countdown.findMany()
    return rows.reduce<CountdownStore>((acc, row) => {
        acc[row.id] = toCountdownEntry(row)
        return acc
    }, {})
}

/** Persists a new countdown and returns the created entry (with its assigned id). */
export async function createCountdown(input: CountdownInput): Promise<CountdownEntry> {
    const guildId = normalizeSnowflake(input.guildId)
    const channelId = normalizeSnowflake(input.channelId)
    const messageId = normalizeSnowflake(input.messageId)
    const createdBy = normalizeSnowflake(input.createdBy)
    if (!guildId || !channelId || !messageId || !createdBy) {
        throw new Error("createCountdown: invalid Discord snowflake in input.")
    }
    const prisma = getPrismaClient()
    const row = await prisma.countdown.create({
        data: {
            guildId,
            channelId,
            messageId,
            eventName: input.eventName,
            description: input.description,
            imageUrl: input.imageUrl,
            color: input.color,
            footer: input.footer,
            finishMessage: input.finishMessage,
            mentionRoleId: input.mentionRoleId ? normalizeSnowflake(input.mentionRoleId) : null,
            targetTime: input.targetTime,
            createdBy,
        },
    })
    return toCountdownEntry(row)
}

/** Removes a single countdown by id. No-op if the row no longer exists. */
export async function deleteCountdown(id: number): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.countdown.deleteMany({ where: { id } })
}

/** Bulk-removes countdowns whose target time is at or before `beforeTime`; returns rows deleted. */
export async function deleteExpiredCountdowns(beforeTime: Date): Promise<number> {
    const prisma = getPrismaClient()
    const result = await prisma.countdown.deleteMany({
        where: { targetTime: { lte: beforeTime } },
    })
    return result.count
}
