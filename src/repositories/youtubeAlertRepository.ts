import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import { normalizeOptionalDiscordSnowflake } from "../shared/discord-snowflake.js"
import type {
    UploadEventType,
    YoutubeAlertEntry,
    YoutubeAlertInput,
    YoutubeAlertPatch,
    YoutubeChannelLeaseEntry,
    YoutubeWatchEntry,
} from "../types/index.js"
import { parseUploadEventTypes } from "../util/uploadEventType.js"

const YOUTUBE_CHANNEL_ID_RE = /^UC[\w-]{22}$/

function toWatch(row: {
    id: number
    guildId: string
    youtubeChannelId: string
    youtubeChannelName: string
    createdAt: Date
}): YoutubeWatchEntry {
    return {
        id: row.id,
        guildId: row.guildId,
        youtubeChannelId: row.youtubeChannelId,
        youtubeChannelName: row.youtubeChannelName,
        createdAt: row.createdAt,
    }
}

function toAlert(row: {
    id: number
    watchId: number
    discordChannelId: string
    mentionRoleIds: string[]
    messageTemplate: string | null
    eventTypes: string[]
    createdBy: string
    createdAt: Date
}): YoutubeAlertEntry {
    return {
        id: row.id,
        watchId: row.watchId,
        discordChannelId: row.discordChannelId,
        mentionRoleIds: [...row.mentionRoleIds],
        messageTemplate: row.messageTemplate,
        eventTypes: parseUploadEventTypes(row.eventTypes),
        createdBy: row.createdBy,
        createdAt: row.createdAt,
    }
}

function requireSnowflake(value: string, label: string): string {
    const id = normalizeOptionalDiscordSnowflake(value)
    if (!id) {
        throw new Error(`youtubeAlertRepository: invalid Discord snowflake for ${label}.`)
    }
    return id
}

function requireYoutubeChannelId(value: string): string {
    const id = value.trim()
    if (!YOUTUBE_CHANNEL_ID_RE.test(id)) {
        throw new Error("youtubeAlertRepository: invalid YouTube channel id.")
    }
    return id
}

function requireEventTypes(types: UploadEventType[]): UploadEventType[] {
    const parsed = parseUploadEventTypes(types)
    if (parsed.length === 0) {
        throw new Error("youtubeAlertRepository: at least one Upload event type is required.")
    }
    return parsed
}

function requireRoleIds(ids: string[]): string[] {
    const out: string[] = []
    for (const raw of ids) {
        const id = normalizeOptionalDiscordSnowflake(raw)
        if (!id) {
            throw new Error("youtubeAlertRepository: invalid Discord snowflake for mention role.")
        }
        if (!out.includes(id)) out.push(id)
    }
    return out
}

/** Loads every Upload Watch with its Alerts. */
export async function getAllYoutubeWatchesFromDatabase(): Promise<{
    watches: YoutubeWatchEntry[]
    alerts: YoutubeAlertEntry[]
    seenByWatch: Record<number, string[]>
    leases: YoutubeChannelLeaseEntry[]
}> {
    const prisma = getPrismaClient()
    const [watchRows, alertRows, seenRows, leaseRows] = await Promise.all([
        prisma.youtubeWatch.findMany(),
        prisma.youtubeAlert.findMany(),
        prisma.youtubeSeenVideo.findMany(),
        prisma.youtubeChannelLease.findMany(),
    ])
    const seenByWatch: Record<number, string[]> = {}
    for (const row of seenRows) {
        const list = seenByWatch[row.watchId] ?? []
        list.push(row.videoId)
        seenByWatch[row.watchId] = list
    }
    return {
        watches: watchRows.map(toWatch),
        alerts: alertRows.map(toAlert),
        seenByWatch,
        leases: leaseRows.map((row) => ({
            youtubeChannelId: row.youtubeChannelId,
            leaseExpiresAt: row.leaseExpiresAt,
            updatedAt: row.updatedAt,
        })),
    }
}

/** Creates an Upload Watch. */
export async function createYoutubeWatch(input: {
    guildId: string
    youtubeChannelId: string
    youtubeChannelName: string
}): Promise<YoutubeWatchEntry> {
    const prisma = getPrismaClient()
    const row = await prisma.youtubeWatch.create({
        data: {
            guildId: requireSnowflake(input.guildId, "guildId"),
            youtubeChannelId: requireYoutubeChannelId(input.youtubeChannelId),
            youtubeChannelName: input.youtubeChannelName.trim() || input.youtubeChannelId,
        },
    })
    return toWatch(row)
}

/** Creates an Upload Alert on an existing Watch. */
export async function createYoutubeAlert(input: {
    watchId: number
    discordChannelId: string
    mentionRoleIds: string[]
    messageTemplate: string | null
    eventTypes: UploadEventType[]
    createdBy: string
}): Promise<YoutubeAlertEntry> {
    const prisma = getPrismaClient()
    const row = await prisma.youtubeAlert.create({
        data: {
            watchId: input.watchId,
            discordChannelId: requireSnowflake(input.discordChannelId, "discordChannelId"),
            mentionRoleIds: requireRoleIds(input.mentionRoleIds),
            messageTemplate: input.messageTemplate?.trim() || null,
            eventTypes: requireEventTypes(input.eventTypes),
            createdBy: requireSnowflake(input.createdBy, "createdBy"),
        },
    })
    return toAlert(row)
}

/** Creates a Watch (if needed) and an Alert. `createdWatch` is true when the Watch row is new. */
export async function createYoutubeAlertWithWatch(input: YoutubeAlertInput): Promise<{
    watch: YoutubeWatchEntry
    alert: YoutubeAlertEntry
    createdWatch: boolean
}> {
    const prisma = getPrismaClient()
    const guildId = requireSnowflake(input.guildId, "guildId")
    const youtubeChannelId = requireYoutubeChannelId(input.youtubeChannelId)
    const existing = await prisma.youtubeWatch.findUnique({
        where: { guildId_youtubeChannelId: { guildId, youtubeChannelId } },
    })
    if (existing) {
        const alert = await createYoutubeAlert({
            watchId: existing.id,
            discordChannelId: input.discordChannelId,
            mentionRoleIds: input.mentionRoleIds,
            messageTemplate: input.messageTemplate,
            eventTypes: input.eventTypes,
            createdBy: input.createdBy,
        })
        return { watch: toWatch(existing), alert, createdWatch: false }
    }
    return prisma.$transaction(async (tx) => {
        const watchRow = await tx.youtubeWatch.create({
            data: {
                guildId,
                youtubeChannelId,
                youtubeChannelName: input.youtubeChannelName.trim() || youtubeChannelId,
            },
        })
        const alertRow = await tx.youtubeAlert.create({
            data: {
                watchId: watchRow.id,
                discordChannelId: requireSnowflake(input.discordChannelId, "discordChannelId"),
                mentionRoleIds: requireRoleIds(input.mentionRoleIds),
                messageTemplate: input.messageTemplate?.trim() || null,
                eventTypes: requireEventTypes(input.eventTypes),
                createdBy: requireSnowflake(input.createdBy, "createdBy"),
            },
        })
        return { watch: toWatch(watchRow), alert: toAlert(alertRow), createdWatch: true }
    })
}

/** Updates an Upload Alert. Returns null when the id is missing. */
export async function updateYoutubeAlert(
    id: number,
    patch: YoutubeAlertPatch
): Promise<YoutubeAlertEntry | null> {
    const prisma = getPrismaClient()
    const data: {
        discordChannelId?: string
        mentionRoleIds?: string[]
        messageTemplate?: string | null
        eventTypes?: UploadEventType[]
    } = {}
    if (patch.discordChannelId !== undefined) {
        data.discordChannelId = requireSnowflake(patch.discordChannelId, "discordChannelId")
    }
    if (patch.mentionRoleIds !== undefined) {
        data.mentionRoleIds = requireRoleIds(patch.mentionRoleIds)
    }
    if (patch.messageTemplate !== undefined) {
        data.messageTemplate = patch.messageTemplate?.trim() || null
    }
    if (patch.eventTypes !== undefined) {
        data.eventTypes = requireEventTypes(patch.eventTypes)
    }
    try {
        const row = await prisma.youtubeAlert.update({ where: { id }, data })
        return toAlert(row)
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            return null
        }
        throw error
    }
}

/**
 * Deletes an Alert. When it was the last Alert on the Watch, deletes the Watch too.
 * @returns the removed Alert and Watch (Watch only when this call removed it).
 */
export async function deleteYoutubeAlert(id: number): Promise<{
    alert: YoutubeAlertEntry
    removedWatch: YoutubeWatchEntry | null
} | null> {
    const prisma = getPrismaClient()
    const existing = await prisma.youtubeAlert.findUnique({
        where: { id },
        include: { watch: { include: { alerts: true } } },
    })
    if (!existing) return null
    const remaining = existing.watch.alerts.filter((row) => row.id !== id)
    return prisma.$transaction(async (tx) => {
        await tx.youtubeAlert.delete({ where: { id } })
        let removedWatch: YoutubeWatchEntry | null = null
        if (remaining.length === 0) {
            await tx.youtubeWatch.delete({ where: { id: existing.watchId } })
            removedWatch = toWatch(existing.watch)
        }
        return { alert: toAlert(existing), removedWatch }
    })
}

/** Inserts seen video IDs, ignoring duplicates. */
export async function addYoutubeSeenVideos(watchId: number, videoIds: string[]): Promise<void> {
    const unique = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))]
    if (unique.length === 0) return
    const prisma = getPrismaClient()
    await prisma.youtubeSeenVideo.createMany({
        data: unique.map((videoId) => ({ watchId, videoId })),
        skipDuplicates: true,
    })
}

/** Upserts a PubSub lease expiry for a YouTube channel. */
export async function upsertYoutubeChannelLease(
    youtubeChannelId: string,
    leaseExpiresAt: Date
): Promise<YoutubeChannelLeaseEntry> {
    const prisma = getPrismaClient()
    const channelId = requireYoutubeChannelId(youtubeChannelId)
    const row = await prisma.youtubeChannelLease.upsert({
        where: { youtubeChannelId: channelId },
        create: { youtubeChannelId: channelId, leaseExpiresAt },
        update: { leaseExpiresAt },
    })
    return {
        youtubeChannelId: row.youtubeChannelId,
        leaseExpiresAt: row.leaseExpiresAt,
        updatedAt: row.updatedAt,
    }
}

/** Removes a PubSub lease row. */
export async function deleteYoutubeChannelLease(youtubeChannelId: string): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.youtubeChannelLease.deleteMany({
        where: { youtubeChannelId: requireYoutubeChannelId(youtubeChannelId) },
    })
}
