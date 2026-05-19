import { Prisma } from "@prisma/client"
import { getPrismaClient } from "../lib/database.js"
import type {
    PlaylistData,
    PlaylistSummary,
    PlaylistTrackData,
    PlaylistTrackInput,
} from "../types/index.js"

export class PlaylistDuplicateNameError extends Error {
    constructor(name: string) {
        super(`A playlist named "${name}" already exists.`)
        this.name = "PlaylistDuplicateNameError"
    }
}

export class PlaylistNotFoundError extends Error {
    constructor() {
        super("Playlist not found.")
        this.name = "PlaylistNotFoundError"
    }
}

export class PlaylistTrackNotFoundError extends Error {
    constructor(position: number) {
        super(`No track at position ${position}.`)
        this.name = "PlaylistTrackNotFoundError"
    }
}

function toPlaylistTrackData(row: {
    id: number
    title: string
    uri: string
    author: string
    duration: number
    thumbnailUrl: string | null
    addedAt: Date
    position: number
}): PlaylistTrackData {
    return {
        id: row.id,
        title: row.title,
        uri: row.uri,
        author: row.author,
        duration: row.duration,
        thumbnailUrl: row.thumbnailUrl,
        addedAt: row.addedAt,
        position: row.position,
    }
}

function toPlaylistData(row: {
    id: number
    name: string
    userId: string
    createdAt: Date
    updatedAt: Date
    tracks: Array<{
        id: number
        title: string
        uri: string
        author: string
        duration: number
        thumbnailUrl: string | null
        addedAt: Date
        position: number
    }>
}): PlaylistData {
    return {
        id: row.id,
        name: row.name,
        userId: row.userId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        tracks: row.tracks.map(toPlaylistTrackData),
    }
}

function toPlaylistSummary(row: {
    id: number
    name: string
    createdAt: Date
    _count: { tracks: number }
    tracks: Array<{ duration: number }>
}): PlaylistSummary {
    const totalDuration = row.tracks.reduce((acc, t) => acc + t.duration, 0)
    return {
        id: row.id,
        name: row.name,
        trackCount: row._count.tracks,
        totalDuration,
        createdAt: row.createdAt,
    }
}

const playlistWithTracksInclude = {
    tracks: { orderBy: { position: "asc" as const } },
} as const

/** Returns all playlists for a user with track counts and total duration. */
export async function getUserPlaylists(userId: string): Promise<PlaylistSummary[]> {
    const prisma = getPrismaClient()
    const rows = await prisma.playlist.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: {
            _count: { select: { tracks: true } },
            tracks: { select: { duration: true } },
        },
    })
    return rows.map(toPlaylistSummary)
}

/** Returns a single playlist by user and name, with tracks ordered by position. */
export async function getPlaylist(userId: string, name: string): Promise<PlaylistData | null> {
    const prisma = getPrismaClient()
    const row = await prisma.playlist.findUnique({
        where: { userId_name: { userId, name } },
        include: playlistWithTracksInclude,
    })
    return row ? toPlaylistData(row) : null
}

/** Returns a playlist by id with tracks ordered by position. */
export async function getPlaylistById(playlistId: number): Promise<PlaylistData | null> {
    const prisma = getPrismaClient()
    const row = await prisma.playlist.findUnique({
        where: { id: playlistId },
        include: playlistWithTracksInclude,
    })
    return row ? toPlaylistData(row) : null
}

/** Creates an empty playlist for the user. */
export async function createPlaylist(userId: string, name: string): Promise<PlaylistData> {
    const prisma = getPrismaClient()
    try {
        const row = await prisma.playlist.create({
            data: { userId, name },
            include: playlistWithTracksInclude,
        })
        return toPlaylistData(row)
    } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            throw new PlaylistDuplicateNameError(name)
        }
        throw err
    }
}

/** Deletes a playlist and cascades to its tracks. */
export async function deletePlaylist(userId: string, name: string): Promise<void> {
    const prisma = getPrismaClient()
    const result = await prisma.playlist.deleteMany({
        where: { userId, name },
    })
    if (result.count === 0) {
        throw new PlaylistNotFoundError()
    }
}

/** Returns tracks for a playlist ordered by position. */
export async function getPlaylistTracks(playlistId: number): Promise<PlaylistTrackData[]> {
    const prisma = getPrismaClient()
    const rows = await prisma.playlistTrack.findMany({
        where: { playlistId },
        orderBy: { position: "asc" },
    })
    return rows.map(toPlaylistTrackData)
}

/** Appends a track with the next available position. */
export async function addTrackToPlaylist(
    playlistId: number,
    trackData: PlaylistTrackInput
): Promise<PlaylistTrackData> {
    const rows = await addTracksToPlaylist(playlistId, [trackData])
    return rows[0]!
}

/** Appends multiple tracks in order with consecutive positions. */
export async function addTracksToPlaylist(
    playlistId: number,
    tracksData: PlaylistTrackInput[]
): Promise<PlaylistTrackData[]> {
    if (tracksData.length === 0) return []
    const prisma = getPrismaClient()
    return prisma.$transaction(async (tx) => {
        const agg = await tx.playlistTrack.aggregate({
            where: { playlistId },
            _max: { position: true },
        })
        let nextPosition = (agg._max.position ?? 0) + 1
        const created: PlaylistTrackData[] = []
        for (const trackData of tracksData) {
            const row = await tx.playlistTrack.create({
                data: {
                    playlistId,
                    title: trackData.title,
                    uri: trackData.uri,
                    author: trackData.author,
                    duration: trackData.duration,
                    thumbnailUrl: trackData.thumbnailUrl ?? null,
                    addedAt: trackData.addedAt,
                    position: nextPosition,
                },
            })
            nextPosition += 1
            created.push(toPlaylistTrackData(row))
        }
        await tx.playlist.update({
            where: { id: playlistId },
            data: { updatedAt: new Date() },
        })
        return created
    })
}

/** Moves a track from one 1-based position to another and renumbers the playlist. */
export async function movePlaylistTrack(
    playlistId: number,
    fromPosition: number,
    toPosition: number
): Promise<void> {
    if (fromPosition === toPosition) return
    const prisma = getPrismaClient()
    await prisma.$transaction(async (tx) => {
        const rows = await tx.playlistTrack.findMany({
            where: { playlistId },
            orderBy: { position: "asc" },
        })
        if (rows.length === 0) {
            throw new PlaylistTrackNotFoundError(fromPosition)
        }
        const fromIdx = rows.findIndex((r) => r.position === fromPosition)
        if (fromIdx === -1) {
            throw new PlaylistTrackNotFoundError(fromPosition)
        }
        if (toPosition < 1 || toPosition > rows.length) {
            throw new PlaylistTrackNotFoundError(toPosition)
        }
        const reordered = [...rows]
        const [moved] = reordered.splice(fromIdx, 1)
        if (!moved) {
            throw new PlaylistTrackNotFoundError(fromPosition)
        }
        reordered.splice(toPosition - 1, 0, moved)
        for (let i = 0; i < reordered.length; i++) {
            const row = reordered[i]!
            if (row.position !== i + 1) {
                await tx.playlistTrack.update({
                    where: { id: row.id },
                    data: { position: i + 1 },
                })
            }
        }
        await tx.playlist.update({
            where: { id: playlistId },
            data: { updatedAt: new Date() },
        })
    })
}

/** Removes the track at the given position and reorders remaining tracks. */
export async function removeTrackFromPlaylist(
    playlistId: number,
    position: number
): Promise<void> {
    const prisma = getPrismaClient()
    await prisma.$transaction(async (tx) => {
        const deleted = await tx.playlistTrack.deleteMany({
            where: { playlistId, position },
        })
        if (deleted.count === 0) {
            throw new PlaylistTrackNotFoundError(position)
        }
        await tx.playlistTrack.updateMany({
            where: { playlistId, position: { gt: position } },
            data: { position: { decrement: 1 } },
        })
        await tx.playlist.update({
            where: { id: playlistId },
            data: { updatedAt: new Date() },
        })
    })
}
