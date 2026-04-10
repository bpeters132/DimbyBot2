"use server"

import type { ApiResponse, PlayerStateResponse, QueueResponse } from "@/types/web"
import { serverFetchBot } from "@/server/fetch-bot-api"

export type PlayerCommand = "pause" | "skip" | "stop" | "seek" | "loop" | "shuffle" | "autoplay"

type Ok<T> = { ok: true; data: T }
type Err = { ok: false; error: string }

async function readPlayerStateResult(res: Response): Promise<Ok<PlayerStateResponse> | Err> {
    const text = await res.text()
    if (!text.trim()) {
        return { ok: false, error: "Empty response from bot API." }
    }
    let payload: ApiResponse<PlayerStateResponse>
    try {
        payload = JSON.parse(text) as ApiResponse<PlayerStateResponse>
    } catch {
        return { ok: false, error: "Invalid JSON from bot API." }
    }
    if (!res.ok || payload.ok === false) {
        const msg =
            payload.ok === false
                ? payload.error.details || payload.error.error
                : "Player request failed."
        return { ok: false, error: msg }
    }
    return { ok: true, data: payload.data }
}

async function readQueueResult(res: Response): Promise<Ok<QueueResponse> | Err> {
    const text = await res.text()
    if (!text.trim()) {
        return { ok: false, error: "Empty response from bot API." }
    }
    let payload: ApiResponse<QueueResponse>
    try {
        payload = JSON.parse(text) as ApiResponse<QueueResponse>
    } catch {
        return { ok: false, error: "Invalid JSON from bot API." }
    }
    if (!res.ok || payload.ok === false) {
        const errorPayload = payload.ok === false ? payload.error : null
        const detail = errorPayload?.details || errorPayload?.error
        const msg =
            payload.ok === false ? detail ?? "Queue request failed." : "Queue request failed."
        return { ok: false, error: msg }
    }
    return { ok: true, data: payload.data }
}

export async function getPlayerStateAction(guildId: string): Promise<Ok<PlayerStateResponse> | Err> {
    const res = await serverFetchBot(`/api/guilds/${guildId}/player`)
    return readPlayerStateResult(res)
}

export async function getPlayerQueueAction(
    guildId: string,
    page: number,
    limit: number
): Promise<Ok<QueueResponse> | Err> {
    const search = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    })
    const res = await serverFetchBot(`/api/guilds/${guildId}/queue?${search.toString()}`)
    return readQueueResult(res)
}

export async function postPlayerCommandAction(
    guildId: string,
    command: PlayerCommand,
    value?: number
): Promise<Ok<PlayerStateResponse> | Err> {
    const res = await serverFetchBot(`/api/guilds/${guildId}/player`, {
        method: "POST",
        body: JSON.stringify({ action: command, value }),
        contentType: "application/json",
    })
    return readPlayerStateResult(res)
}

export async function postPlayerPlayAction(
    guildId: string,
    query: string,
    requesterDiscordUserId: string
): Promise<Ok<PlayerStateResponse> | Err> {
    const res = await serverFetchBot(`/api/guilds/${guildId}/player/play`, {
        method: "POST",
        body: JSON.stringify({ query, requesterDiscordUserId }),
        contentType: "application/json",
    })
    return readPlayerStateResult(res)
}
