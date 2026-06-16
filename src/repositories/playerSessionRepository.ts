import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import type {
    PlayerSessionData,
    PlayerSessionSnapshotV1,
    PersistedQueueTrack,
} from "../types/index.js"

function parsePersistedQueueTrack(value: unknown): PersistedQueueTrack | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const raw = value as Record<string, unknown>
    if (typeof raw.title !== "string" || !raw.title.trim()) return null
    if (typeof raw.author !== "string" || !raw.author.trim()) return null
    if (typeof raw.uri !== "string" || !raw.uri.trim()) return null
    if (typeof raw.duration !== "number" || !Number.isFinite(raw.duration)) return null
    if (typeof raw.isStream !== "boolean") return null

    let encoded: string | null = null
    if (raw.encoded !== null && raw.encoded !== undefined) {
        if (typeof raw.encoded !== "string") return null
        encoded = raw.encoded
    }
    let requesterId: string | null = null
    if (raw.requesterId !== null && raw.requesterId !== undefined) {
        if (typeof raw.requesterId !== "string") return null
        requesterId = raw.requesterId
    }
    let thumbnailUrl: string | null = null
    if (raw.thumbnailUrl !== null && raw.thumbnailUrl !== undefined) {
        if (typeof raw.thumbnailUrl !== "string") return null
        thumbnailUrl = raw.thumbnailUrl
    }

    return {
        title: raw.title.trim(),
        author: raw.author.trim(),
        uri: raw.uri.trim(),
        duration: raw.duration,
        encoded,
        requesterId,
        thumbnailUrl,
        isStream: raw.isStream,
    }
}

function parseSnapshot(value: Prisma.JsonValue): PlayerSessionSnapshotV1 | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const raw = value as Record<string, unknown>
    if (raw.version !== 1) return null
    if (typeof raw.volume !== "number") return null
    if (raw.repeatMode !== "off" && raw.repeatMode !== "track" && raw.repeatMode !== "queue") {
        return null
    }
    if (typeof raw.paused !== "boolean" || typeof raw.playing !== "boolean") return null
    if (typeof raw.autoplay !== "boolean" || typeof raw.rrqEnabled !== "boolean") return null
    if (!Array.isArray(raw.queue)) return null

    let current: PersistedQueueTrack | null = null
    if (raw.current !== null) {
        current = parsePersistedQueueTrack(raw.current)
        if (!current) return null
    }

    const queue: PersistedQueueTrack[] = []
    for (const item of raw.queue) {
        const track = parsePersistedQueueTrack(item)
        if (!track) return null
        queue.push(track)
    }

    return {
        version: 1,
        volume: raw.volume,
        repeatMode: raw.repeatMode,
        paused: raw.paused,
        playing: raw.playing,
        autoplay: raw.autoplay,
        rrqEnabled: raw.rrqEnabled,
        current,
        queue,
    }
}

function toPlayerSessionData(row: {
    guildId: string
    voiceChannelId: string
    textChannelId: string | null
    snapshot: Prisma.JsonValue
    updatedAt: Date
}): PlayerSessionData | null {
    const snapshot = parseSnapshot(row.snapshot)
    if (!snapshot) return null
    return {
        guildId: row.guildId,
        voiceChannelId: row.voiceChannelId,
        textChannelId: row.textChannelId,
        snapshot,
        updatedAt: row.updatedAt,
    }
}

/** Upserts a player session snapshot for crash/restart recovery. */
export async function upsertPlayerSession(
    guildId: string,
    voiceChannelId: string,
    textChannelId: string | null,
    snapshot: PlayerSessionSnapshotV1
): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.playerSession.upsert({
        where: { guildId },
        create: {
            guildId,
            voiceChannelId,
            textChannelId,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
        update: {
            voiceChannelId,
            textChannelId,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
    })
}

/** Removes a persisted player session (intentional destroy or stale cleanup). */
export async function deletePlayerSession(guildId: string): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.playerSession.deleteMany({ where: { guildId } })
}

/** Returns all persisted player sessions with valid v1 snapshots. */
export async function listPlayerSessions(): Promise<PlayerSessionData[]> {
    const prisma = getPrismaClient()
    const rows = await prisma.playerSession.findMany()
    const out: PlayerSessionData[] = []
    for (const row of rows) {
        const parsed = toPlayerSessionData(row)
        if (parsed) out.push(parsed)
    }
    return out
}

/** Loads a single player session by guild id. */
export async function getPlayerSession(guildId: string): Promise<PlayerSessionData | null> {
    const prisma = getPrismaClient()
    const row = await prisma.playerSession.findUnique({ where: { guildId } })
    if (!row) return null
    return toPlayerSessionData(row)
}
