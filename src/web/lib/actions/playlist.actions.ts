"use server"

import type {
    AddPlaylistTrackBody,
    AddPlaylistTrackFromQueryBody,
    AddTracksFromQueryResponse,
    PlaylistData,
    PlaylistListResponse,
    PlaylistPlayResponse,
    PlaylistTrackData,
} from "@/types/web"
import {
    parseBotApiActionResponse,
    type BotApiActionErr,
    type BotApiActionOk,
} from "@/lib/parse-bot-api-response"
import { playlistPlayTimeoutMs } from "@/lib/playlist-play-timeout"
import { serverFetchBot } from "@/server/fetch-bot-api"

type Ok<T> = BotApiActionOk<T>
type Err = BotApiActionErr

async function parseApiResponse<T>(res: Response): Promise<Ok<T> | Err> {
    return parseBotApiActionResponse<T>(res)
}

export async function getPlaylistsAction(): Promise<Ok<PlaylistListResponse> | Err> {
    try {
        const res = await serverFetchBot("/api/playlists")
        return parseApiResponse<PlaylistListResponse>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load playlists."
        return { ok: false, error: message }
    }
}

export async function getPlaylistAction(
    playlistId: number
): Promise<Ok<PlaylistData> | Err> {
    try {
        const res = await serverFetchBot(`/api/playlists/${playlistId}`)
        return parseApiResponse<PlaylistData>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load playlist."
        return { ok: false, error: message }
    }
}

export async function createPlaylistAction(name: string): Promise<Ok<PlaylistData> | Err> {
    try {
        const res = await serverFetchBot("/api/playlists", {
            method: "POST",
            body: JSON.stringify({ name }),
            contentType: "application/json",
        })
        return parseApiResponse<PlaylistData>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create playlist."
        return { ok: false, error: message }
    }
}

export async function deletePlaylistAction(
    playlistId: number
): Promise<Ok<{ deleted: true }> | Err> {
    try {
        const res = await serverFetchBot(`/api/playlists/${playlistId}`, {
            method: "DELETE",
        })
        return parseApiResponse<{ deleted: true }>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to delete playlist."
        return { ok: false, error: message }
    }
}

export async function addTrackToPlaylistAction(
    playlistId: number,
    track: AddPlaylistTrackBody
): Promise<Ok<PlaylistTrackData> | Err> {
    try {
        const res = await serverFetchBot(`/api/playlists/${playlistId}/tracks`, {
            method: "POST",
            body: JSON.stringify(track),
            contentType: "application/json",
        })
        return parseApiResponse<PlaylistTrackData>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to add track."
        return { ok: false, error: message }
    }
}

export async function removeTrackFromPlaylistAction(
    playlistId: number,
    trackId: number
): Promise<Ok<{ removed: true }> | Err> {
    try {
        const res = await serverFetchBot(
            `/api/playlists/${playlistId}/tracks/${trackId}`,
            { method: "DELETE" }
        )
        return parseApiResponse<{ removed: true }>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to remove track."
        return { ok: false, error: message }
    }
}

export async function addTrackFromQueryToPlaylistAction(
    playlistId: number,
    body: AddPlaylistTrackFromQueryBody
): Promise<Ok<AddTracksFromQueryResponse> | Err> {
    try {
        const res = await serverFetchBot(`/api/playlists/${playlistId}/tracks/from-query`, {
            method: "POST",
            body: JSON.stringify(body),
            contentType: "application/json",
        })
        return parseApiResponse<AddTracksFromQueryResponse>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to add track."
        return { ok: false, error: message }
    }
}

export async function movePlaylistTrackAction(
    playlistId: number,
    position: number,
    newPosition: number
): Promise<Ok<PlaylistData> | Err> {
    try {
        const res = await serverFetchBot(`/api/playlists/${playlistId}/tracks/${position}`, {
            method: "PATCH",
            body: JSON.stringify({ newPosition }),
            contentType: "application/json",
        })
        return parseApiResponse<PlaylistData>(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to reorder track."
        return { ok: false, error: message }
    }
}

export async function playPlaylistInGuildAction(
    guildId: string,
    playlistId: number,
    requesterDiscordUserId: string,
    shuffle = false,
    trackCount?: number
): Promise<Ok<PlaylistPlayResponse> | Err> {
    try {
        const res = await serverFetchBot(`/api/guilds/${guildId}/player/play-playlist`, {
            method: "POST",
            body: JSON.stringify({
                playlistId,
                shuffle,
                requesterDiscordUserId,
            }),
            contentType: "application/json",
            timeoutMs: playlistPlayTimeoutMs(trackCount ?? 1),
        })
        const parsed = await parseApiResponse<PlaylistPlayResponse>(res)
        if (parsed.ok === false && res.status === 504) {
            return {
                ok: false,
                error:
                    "The playlist is still loading on the bot but the dashboard timed out. Check the queue — tracks may appear shortly.",
            }
        }
        return parsed
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to queue playlist."
        return { ok: false, error: message }
    }
}
