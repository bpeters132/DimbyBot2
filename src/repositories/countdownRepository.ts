import { getPrismaClient } from "../lib/database.js"
import { normalizeOptionalDiscordSnowflake } from "../shared/discord-snowflake.js"
import type { CountdownEntry, CountdownInput, CountdownStore } from "../types/index.js"

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
    const guildId = normalizeOptionalDiscordSnowflake(input.guildId)
    const channelId = normalizeOptionalDiscordSnowflake(input.channelId)
    const messageId = normalizeOptionalDiscordSnowflake(input.messageId)
    const createdBy = normalizeOptionalDiscordSnowflake(input.createdBy)
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
            mentionRoleId: input.mentionRoleId
                ? normalizeOptionalDiscordSnowflake(input.mentionRoleId)
                : null,
            targetTime: input.targetTime,
            createdBy,
        },
    })
    return toCountdownEntry(row)
}

/**
 * Removes a single countdown by id.
 * @returns true when a row was deleted; false when the id was already gone.
 */
export async function deleteCountdown(id: number): Promise<boolean> {
    const prisma = getPrismaClient()
    const result = await prisma.countdown.deleteMany({ where: { id } })
    return result.count > 0
}

/** Bulk-removes countdowns whose target time is at or before `beforeTime`; returns rows deleted. */
export async function deleteExpiredCountdowns(beforeTime: Date): Promise<number> {
    const prisma = getPrismaClient()
    const result = await prisma.countdown.deleteMany({
        where: { targetTime: { lte: beforeTime } },
    })
    return result.count
}
