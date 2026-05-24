import { getAuthenticatedSession } from "../../shared/api-auth.js"
import { resolveDiscordUserSnowflake } from "../../shared/discord-user-id.js"
import type {
    ApiResponse,
    PlaylistData as DomainPlaylistData,
    PlaylistTrackData as DomainPlaylistTrackData,
    PlaylistSummary as DomainPlaylistSummary,
} from "../../types/index.js"
import type {
    AddPlaylistTrackBody,
    AddTracksFromQueryResponse,
    PlaylistData,
    PlaylistListResponse,
    PlaylistTrackData,
    PlaylistSummary,
} from "../../types/web.js"
import {
    PlaylistDuplicateNameError,
    PlaylistTrackNotFoundError,
    addTrackToPlaylist,
    addTracksToPlaylist,
    createPlaylist,
    deletePlaylist,
    getPlaylistById,
    getUserPlaylists,
    movePlaylistTrack,
    removeTrackFromPlaylistById,
} from "../../repositories/playlistRepository.js"
import { getBotClient } from "../../lib/botClientRegistry.js"
import {
    isPlaylistSearchTransientFailure,
    pickPlayerForPlaylistSearch,
    searchTracksForPlaylist,
} from "../../util/playlistQueue.js"

type AuthOk = { ok: true; discordUserId: string }
type AuthFail = { ok: false; status: number; body: ApiResponse<never> }

async function resolvePlaylistUser(headers: Headers): Promise<AuthOk | AuthFail> {
    try {
        const sessionResult = await getAuthenticatedSession(headers)
        if (sessionResult.ok === false) {
            return {
                ok: false,
                status: sessionResult.status,
                body: {
                    ok: false,
                    error: { error: sessionResult.error, details: sessionResult.details },
                },
            }
        }

        const discordUserId = await resolveDiscordUserSnowflake(
            sessionResult.session.user.id,
            headers
        )
        if (!discordUserId) {
            return {
                ok: false,
                status: 403,
                body: {
                    ok: false,
                    error: {
                        error: "Discord account required",
                        details: "Could not resolve your Discord user id.",
                    },
                },
            }
        }

        return { ok: true, discordUserId }
    } catch (error: unknown) {
        logPlaylistsHandlerError("resolvePlaylistUser", error)
        return { ok: false, status: 500, body: internalErrorBody() }
    }
}

const STRICT_POSITIVE_INT = /^[1-9]\d*$/

function parseStrictPositiveInt(value: string): number | null {
    const trimmed = value.trim()
    if (!STRICT_POSITIVE_INT.test(trimmed)) return null
    const n = Number.parseInt(trimmed, 10)
    if (!Number.isFinite(n) || n < 1) return null
    return n
}

function parsePlaylistId(playlistId: string): number | null {
    return parseStrictPositiveInt(playlistId)
}

function parsePosition(position: string): number | null {
    return parseStrictPositiveInt(position)
}

function logPlaylistsHandlerError(handler: string, error: unknown): void {
    console.error(`[playlists:${handler}]`, error)
}

function internalErrorBody(): ApiResponse<never> {
    return {
        ok: false,
        error: { error: "internal_error", details: "Internal server error." },
    }
}

function serializePlaylistTrackForApi(track: DomainPlaylistTrackData): PlaylistTrackData {
    return {
        id: track.id,
        title: track.title,
        uri: track.uri,
        author: track.author,
        duration: track.duration,
        thumbnailUrl: track.thumbnailUrl,
        addedAt: track.addedAt.toISOString(),
        position: track.position,
    }
}

function serializePlaylistTracksForApi(tracks: DomainPlaylistTrackData[]): PlaylistTrackData[] {
    return tracks.map(serializePlaylistTrackForApi)
}

function serializePlaylistForApi(playlist: DomainPlaylistData): PlaylistData {
    return {
        id: playlist.id,
        name: playlist.name,
        userId: playlist.userId,
        createdAt: playlist.createdAt.toISOString(),
        updatedAt: playlist.updatedAt.toISOString(),
        tracks: serializePlaylistTracksForApi(playlist.tracks),
    }
}

function serializePlaylistSummaryForApi(summary: DomainPlaylistSummary): PlaylistSummary {
    return {
        id: summary.id,
        name: summary.name,
        trackCount: summary.trackCount,
        totalDuration: summary.totalDuration,
        createdAt: summary.createdAt.toISOString(),
    }
}

async function requireOwnedPlaylist(
    discordUserId: string,
    playlistId: number
): Promise<
    | { ok: true; playlist: DomainPlaylistData }
    | { ok: false; status: number; body: ApiResponse<never> }
> {
    try {
        const playlist = await getPlaylistById(playlistId)
        if (!playlist) {
            return {
                ok: false,
                status: 404,
                body: {
                    ok: false,
                    error: { error: "Not found", details: "Playlist not found." },
                },
            }
        }
        if (playlist.userId !== discordUserId) {
            return {
                ok: false,
                status: 403,
                body: {
                    ok: false,
                    error: { error: "Forbidden", details: "You do not own this playlist." },
                },
            }
        }
        return { ok: true, playlist }
    } catch (error: unknown) {
        logPlaylistsHandlerError("requireOwnedPlaylist", error)
        return { ok: false, status: 500, body: internalErrorBody() }
    }
}

function parseTrackBody(raw: unknown): AddPlaylistTrackBody | null {
    if (!raw || typeof raw !== "object") return null
    const b = raw as Record<string, unknown>
    if (typeof b.title !== "string" || !b.title.trim()) return null
    if (typeof b.uri !== "string" || !b.uri.trim()) return null
    if (typeof b.author !== "string") return null
    if (typeof b.duration !== "number" || !Number.isFinite(b.duration) || b.duration < 0) {
        return null
    }
    if (typeof b.addedAt !== "string" || !b.addedAt.trim()) return null
    const added = new Date(b.addedAt)
    if (Number.isNaN(added.getTime())) return null
    const thumbnailUrl =
        typeof b.thumbnailUrl === "string" && b.thumbnailUrl.trim() ? b.thumbnailUrl.trim() : null
    return {
        title: b.title.trim(),
        uri: b.uri.trim(),
        author: b.author.trim() || "Unknown",
        duration: Math.floor(b.duration),
        thumbnailUrl,
        addedAt: b.addedAt,
    }
}

export async function playlistsGET(
    headers: Headers
): Promise<{ status: number; body: ApiResponse<PlaylistListResponse> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    try {
        const playlists = await getUserPlaylists(auth.discordUserId)
        return {
            status: 200,
            body: {
                ok: true,
                data: { playlists: playlists.map(serializePlaylistSummaryForApi) },
            },
        }
    } catch (error: unknown) {
        logPlaylistsHandlerError("playlistsGET", error)
        return { status: 500, body: internalErrorBody() }
    }
}

export async function playlistsPOST(
    headers: Headers,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<PlaylistData> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    if (!rawBody || typeof rawBody !== "object") {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Expected JSON body with name." },
            },
        }
    }
    const name = (rawBody as { name?: unknown }).name
    if (typeof name !== "string" || !name.trim()) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Playlist name is required." },
            },
        }
    }

    try {
        const playlist = await createPlaylist(auth.discordUserId, name.trim())
        return { status: 201, body: { ok: true, data: serializePlaylistForApi(playlist) } }
    } catch (error: unknown) {
        if (error instanceof PlaylistDuplicateNameError) {
            return {
                status: 409,
                body: {
                    ok: false,
                    error: { error: "Conflict", details: error.message },
                },
            }
        }
        logPlaylistsHandlerError("playlistsPOST", error)
        return { status: 500, body: internalErrorBody() }
    }
}

export async function playlistsDetailGET(
    headers: Headers,
    playlistIdParam: string
): Promise<{ status: number; body: ApiResponse<PlaylistData> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    const playlistId = parsePlaylistId(playlistIdParam)
    if (playlistId === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid playlist id." },
            },
        }
    }

    const owned = await requireOwnedPlaylist(auth.discordUserId, playlistId)
    if (owned.ok === false) {
        return { status: owned.status, body: owned.body }
    }

    return { status: 200, body: { ok: true, data: serializePlaylistForApi(owned.playlist) } }
}

export async function playlistsDELETE(
    headers: Headers,
    playlistIdParam: string
): Promise<{ status: number; body: ApiResponse<{ deleted: true }> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    const playlistId = parsePlaylistId(playlistIdParam)
    if (playlistId === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid playlist id." },
            },
        }
    }

    const owned = await requireOwnedPlaylist(auth.discordUserId, playlistId)
    if (owned.ok === false) {
        return { status: owned.status, body: owned.body }
    }

    try {
        await deletePlaylist(auth.discordUserId, owned.playlist.name)
        return {
            status: 200,
            body: { ok: true, data: { deleted: true } },
        }
    } catch (error: unknown) {
        logPlaylistsHandlerError("playlistsDELETE", error)
        return { status: 500, body: internalErrorBody() }
    }
}

export async function playlistTracksPOST(
    headers: Headers,
    playlistIdParam: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<PlaylistTrackData> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    const playlistId = parsePlaylistId(playlistIdParam)
    if (playlistId === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid playlist id." },
            },
        }
    }

    const owned = await requireOwnedPlaylist(auth.discordUserId, playlistId)
    if (owned.ok === false) {
        return { status: owned.status, body: owned.body }
    }

    const body = parseTrackBody(rawBody)
    if (!body) {
        return {
            status: 400,
            body: {
                ok: false,
                error: {
                    error: "Bad request",
                    details: "Invalid track body (title, uri, author, duration, addedAt).",
                },
            },
        }
    }

    try {
        const track = await addTrackToPlaylist(playlistId, {
            title: body.title,
            uri: body.uri,
            author: body.author,
            duration: body.duration,
            thumbnailUrl: body.thumbnailUrl,
            addedAt: new Date(body.addedAt),
        })
        return { status: 201, body: { ok: true, data: serializePlaylistTrackForApi(track) } }
    } catch (error: unknown) {
        logPlaylistsHandlerError("playlistTracksPOST", error)
        return { status: 500, body: internalErrorBody() }
    }
}

export async function playlistTracksFromQueryPOST(
    headers: Headers,
    playlistIdParam: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<AddTracksFromQueryResponse> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    const playlistId = parsePlaylistId(playlistIdParam)
    if (playlistId === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid playlist id." },
            },
        }
    }

    const owned = await requireOwnedPlaylist(auth.discordUserId, playlistId)
    if (owned.ok === false) {
        return { status: owned.status, body: owned.body }
    }

    if (!rawBody || typeof rawBody !== "object") {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Expected JSON body with query." },
            },
        }
    }
    const body = rawBody as { query?: unknown; guildId?: unknown }
    const query = typeof body.query === "string" ? body.query.trim() : ""
    if (!query) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "query is required." },
            },
        }
    }
    const preferredGuildId =
        typeof body.guildId === "string" && body.guildId.trim() ? body.guildId.trim() : undefined

    const client = getBotClient()
    const player = pickPlayerForPlaylistSearch(client.lavalink, preferredGuildId)
    if (!player) {
        return {
            status: 503,
            body: {
                ok: false,
                error: {
                    error: "Search unavailable",
                    details:
                        "The bot is not connected in any voice channel. Join a server voice channel and play a song, or paste a direct track URL.",
                },
            },
        }
    }

    const requester = { id: auth.discordUserId, username: "web-user" }
    const found = await searchTracksForPlaylist(player, query, requester)
    if (found.ok === false) {
        if (isPlaylistSearchTransientFailure(found.error)) {
            return {
                status: 503,
                body: {
                    ok: false,
                    error: { error: "Search failed", details: found.error },
                },
            }
        }
        return {
            status: 404,
            body: {
                ok: false,
                error: { error: "Not found", details: found.error },
            },
        }
    }

    try {
        const addedAt = new Date()
        const tracks = await addTracksToPlaylist(
            playlistId,
            found.tracks.map((t) => ({
                title: t.title,
                uri: t.uri,
                author: t.author,
                duration: t.duration,
                thumbnailUrl: t.thumbnailUrl,
                addedAt,
            }))
        )
        return {
            status: 201,
            body: {
                ok: true,
                data: { added: tracks.length, tracks: serializePlaylistTracksForApi(tracks) },
            },
        }
    } catch (error: unknown) {
        logPlaylistsHandlerError("playlistTracksFromQueryPOST", error)
        return { status: 500, body: internalErrorBody() }
    }
}

export async function playlistTrackMovePATCH(
    headers: Headers,
    playlistIdParam: string,
    positionParam: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<PlaylistData> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    const playlistId = parsePlaylistId(playlistIdParam)
    if (playlistId === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid playlist id." },
            },
        }
    }

    const fromPosition = parsePosition(positionParam)
    if (fromPosition === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid track position." },
            },
        }
    }

    const owned = await requireOwnedPlaylist(auth.discordUserId, playlistId)
    if (owned.ok === false) {
        return { status: owned.status, body: owned.body }
    }

    if (!rawBody || typeof rawBody !== "object") {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Expected JSON body with newPosition." },
            },
        }
    }
    const newPositionRaw = (rawBody as { newPosition?: unknown }).newPosition
    let newPosition: number
    if (typeof newPositionRaw === "number") {
        if (!Number.isInteger(newPositionRaw) || newPositionRaw < 1) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: {
                        error: "Bad request",
                        details: "newPosition must be a positive integer.",
                    },
                },
            }
        }
        newPosition = newPositionRaw
    } else if (typeof newPositionRaw === "string") {
        const parsed = parseStrictPositiveInt(newPositionRaw)
        if (parsed === null) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: {
                        error: "Bad request",
                        details: "newPosition must be a positive integer.",
                    },
                },
            }
        }
        newPosition = parsed
    } else {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "newPosition must be a positive integer." },
            },
        }
    }

    try {
        await movePlaylistTrack(playlistId, fromPosition, newPosition)
        const updated = await getPlaylistById(playlistId)
        if (!updated) {
            return {
                status: 404,
                body: {
                    ok: false,
                    error: { error: "Not found", details: "Playlist not found." },
                },
            }
        }
        return { status: 200, body: { ok: true, data: serializePlaylistForApi(updated) } }
    } catch (error: unknown) {
        if (error instanceof PlaylistTrackNotFoundError) {
            return {
                status: 404,
                body: {
                    ok: false,
                    error: { error: "Not found", details: error.message },
                },
            }
        }
        logPlaylistsHandlerError("playlistTrackMovePATCH", error)
        return { status: 500, body: internalErrorBody() }
    }
}

export async function playlistTracksDELETE(
    headers: Headers,
    playlistIdParam: string,
    trackIdParam: string
): Promise<{ status: number; body: ApiResponse<{ removed: true }> }> {
    const auth = await resolvePlaylistUser(headers)
    if (auth.ok === false) {
        return { status: auth.status, body: auth.body }
    }

    const playlistId = parsePlaylistId(playlistIdParam)
    if (playlistId === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid playlist id." },
            },
        }
    }

    const trackId = parseStrictPositiveInt(trackIdParam)
    if (trackId === null) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Bad request", details: "Invalid track id." },
            },
        }
    }

    const owned = await requireOwnedPlaylist(auth.discordUserId, playlistId)
    if (owned.ok === false) {
        return { status: owned.status, body: owned.body }
    }

    const hasTrack = owned.playlist.tracks.some((t) => t.id === trackId)
    if (!hasTrack) {
        return {
            status: 404,
            body: {
                ok: false,
                error: { error: "Not found", details: "Track not found in this playlist." },
            },
        }
    }

    try {
        await removeTrackFromPlaylistById(playlistId, trackId)
        return { status: 200, body: { ok: true, data: { removed: true } } }
    } catch (error: unknown) {
        if (error instanceof PlaylistTrackNotFoundError) {
            return {
                status: 404,
                body: {
                    ok: false,
                    error: { error: "Not found", details: error.message },
                },
            }
        }
        logPlaylistsHandlerError("playlistTracksDELETE", error)
        return { status: 500, body: internalErrorBody() }
    }
}
