"use server"

import type { ApiResponse, PlayerStateResponse, QueueResponse } from "@/types/web"
import { webPlayerDebug, webPlayerWarn } from "@/lib/web-player-debug-log"
import { serverFetchBot } from "@/server/fetch-bot-api"

export type PlayerCommand = "pause" | "skip" | "stop" | "seek" | "loop" | "shuffle" | "autoplay"

type Ok<T> = { ok: true; data: T }
type Err = { ok: false; error: string }

async function parseApiResponse<T>(res: Response): Promise<Ok<T> | Err> {
    const text = await res.text()
    if (!text.trim()) {
        return { ok: false, error: "Empty response from bot API." }
    }
    let payload: ApiResponse<T>
    try {
        payload = JSON.parse(text) as ApiResponse<T>
    } catch {
        return { ok: false, error: "Invalid JSON from bot API." }
    }
    if (payload.ok === false) {
        const msg = payload.error.details || payload.error.error
        return { ok: false, error: msg }
    }
    if (!res.ok) {
        return { ok: false, error: "Request failed." }
    }
    if (payload.data === undefined || payload.data === null) {
        return { ok: false, error: "Bot API returned success without data." }
    }
    return { ok: true, data: payload.data }
}

async function readPlayerStateResult(res: Response): Promise<Ok<PlayerStateResponse> | Err> {
    return parseApiResponse<PlayerStateResponse>(res)
}

async function readQueueResult(res: Response): Promise<Ok<QueueResponse> | Err> {
    return parseApiResponse<QueueResponse>(res)
}

export async function getPlayerStateAction(
    guildId: string
): Promise<Ok<PlayerStateResponse> | Err> {
    try {
        const res = await serverFetchBot(`/api/guilds/${guildId}/player`)
        const out = await readPlayerStateResult(res)
        if (out.ok === false) {
            webPlayerWarn("getPlayerStateAction: error", { guildId, error: out.error })
            return out
        }
        webPlayerDebug("getPlayerStateAction: ok", {
            guildId,
            inVoiceWithBot: out.data.inVoiceWithBot,
            requesterId: out.data.currentTrack?.requesterId,
            requesterUsername: out.data.currentTrack?.requesterUsername,
        })
        return out
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load player state."
        webPlayerWarn("getPlayerStateAction: transport/parse failure", { guildId, error: message })
        return { ok: false, error: message }
    }
}

export async function getPlayerQueueAction(
    guildId: string,
    page: number,
    limit: number
): Promise<Ok<QueueResponse> | Err> {
    try {
        const search = new URLSearchParams({
            page: String(page),
            limit: String(limit),
        })
        const res = await serverFetchBot(`/api/guilds/${guildId}/queue?${search.toString()}`)
        const out = await readQueueResult(res)
        if (out.ok === false) {
            webPlayerWarn("getPlayerQueueAction: error", { guildId, page, error: out.error })
            return out
        }
        webPlayerDebug("getPlayerQueueAction: ok", {
            guildId,
            page,
            limit,
            itemCount: out.data.items.length,
            firstRequester: out.data.items[0]
                ? {
                      id: out.data.items[0].requesterId,
                      username: out.data.items[0].requesterUsername,
                  }
                : null,
        })
        return out
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to load queue."
        webPlayerWarn("getPlayerQueueAction: transport/parse failure", {
            guildId,
            page,
            limit,
            error: message,
        })
        return { ok: false, error: message }
    }
}

export async function postPlayerCommandAction(
    guildId: string,
    command: PlayerCommand,
    value?: number
): Promise<Ok<PlayerStateResponse> | Err> {
    try {
        const res = await serverFetchBot(`/api/guilds/${guildId}/player`, {
            method: "POST",
            body: JSON.stringify({ action: command, value }),
            contentType: "application/json",
        })
        return await readPlayerStateResult(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to send player command."
        webPlayerWarn("postPlayerCommandAction: transport/parse failure", {
            guildId,
            command,
            error: message,
        })
        return { ok: false, error: message }
    }
}

export async function postPlayerPlayAction(
    guildId: string,
    query: string,
    requesterDiscordUserId: string
): Promise<Ok<PlayerStateResponse> | Err> {
    try {
        const res = await serverFetchBot(`/api/guilds/${guildId}/player/play`, {
            method: "POST",
            body: JSON.stringify({ query, requesterDiscordUserId }),
            contentType: "application/json",
        })
        return await readPlayerStateResult(res)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to queue track."
        webPlayerWarn("postPlayerPlayAction: transport/parse failure", {
            guildId,
            query,
            error: message,
        })
        return { ok: false, error: message }
    }
}
