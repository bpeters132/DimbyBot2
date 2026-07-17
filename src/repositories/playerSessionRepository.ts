import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import type { PlayerSessionData, PlayerSessionSnapshotV1 } from "../types/index.js"
import { parsePlayerSessionSnapshot } from "../util/playerSessionSnapshotParse.js"

function toPlayerSessionData(row: {
    guildId: string
    voiceChannelId: string
    textChannelId: string | null
    snapshot: Prisma.JsonValue
    updatedAt: Date
}): PlayerSessionData | null {
    const snapshot = parsePlayerSessionSnapshot(row.snapshot)
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
