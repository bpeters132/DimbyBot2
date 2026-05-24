"use server"

import type {
    AddPlaylistTrackBody,
    AddPlaylistTrackFromQueryBody,
    AddTracksFromQueryResponse,
    ApiResponse,
    PlaylistData,
    PlaylistListResponse,
    PlaylistPlayResponse,
    PlaylistTrackData,
} from "@/types/web"
import { playlistPlayTimeoutMs } from "@/lib/playlist-play-timeout"
import { serverFetchBot } from "@/server/fetch-bot-api"

type Ok<T> = { ok: true; data: T }
type Err = { ok: false; error: string }

async function parseApiResponse<T>(res: Response): Promise<Ok<T> | Err> {
    const text = await res.text()
    if (!text.trim()) {
        return {
            ok: false,
            error: res.ok
                ? "Empty response from bot API."
                : `Request failed (${res.status}): empty body.`,
        }
    }
    let payload: ApiResponse<T>
    try {
        payload = JSON.parse(text) as ApiResponse<T>
    } catch {
        return {
            ok: false,
            error: res.ok
                ? "Invalid JSON from bot API."
                : `Request failed (${res.status}): invalid JSON.`,
        }
    }
    if (!res.ok) {
        if (payload.ok === false && payload.error && typeof payload.error === "object") {
            const errObj = payload.error as { error?: string; details?: string }
            const msg =
                [errObj.details, errObj.error].filter(Boolean).join(" — ") ||
                `Request failed (${res.status}).`
            return { ok: false, error: msg }
        }
        return { ok: false, error: `Request failed (${res.status}).` }
    }
    if (payload.ok === false) {
        const err: unknown = payload.error
        if (err != null && typeof err === "object") {
            const errObj = err as { error?: string; details?: string }
            const msg =
                [errObj.details, errObj.error].filter(Boolean).join(" — ") ||
                "Bot API returned an error."
            return { ok: false, error: msg }
        }
        if (typeof err === "string" && err.trim()) {
            return { ok: false, error: err.trim() }
        }
        return { ok: false, error: "Bot API returned an error." }
    }
    if (payload.data === undefined || payload.data === null) {
        return { ok: false, error: "Bot API returned success without data." }
    }
    return { ok: true, data: payload.data }
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
