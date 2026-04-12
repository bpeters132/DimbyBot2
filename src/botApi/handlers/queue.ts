import { resolveWebRequesterDiscordId } from "../resolveWebRequesterId.js"
import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse } from "../../types/apiPayloads.js"
import type { QueueResponse } from "../../types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import { toQueueResponse } from "../../web/lib/player-state.js"
import { searchAndEnqueue } from "./searchAndEnqueue.js"

const MAX_QUEUE_PAGE_LIMIT = 100

function clampInt(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** Parses a query integer, truncates toward zero, and clamps to inclusive bounds. */
function parseNumber(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return clampInt(Math.trunc(parsed), min, max)
}

export async function queueGET(
    headers: Headers,
    guildId: string,
    searchParams: URLSearchParams
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.VIEW_PLAYER])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const page = parseNumber(searchParams.get("page"), 1, 1, 10_000)
    const limit = parseNumber(searchParams.get("limit"), 20, 1, MAX_QUEUE_PAGE_LIMIT)
    const player = getBotClient().lavalink.getPlayer(guildId)
    return {
        status: 200,
        body: {
            ok: true,
            data: await toQueueResponse(guildId, player ?? null, page, limit),
        },
    }
}

export async function queuePOST(
    headers: Headers,
    guildId: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.MANAGE_QUEUE])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const requester = resolveWebRequesterDiscordId(rawBody, guard.discordUserId)
    if (requester.ok === false) {
        return {
            status: requester.status,
            body: {
                ok: false,
                error: { error: requester.error, details: requester.details },
            },
        }
    }

    const body = (typeof rawBody === "object" && rawBody !== null ? rawBody : {}) as {
        query?: unknown
    }
    const query = typeof body.query === "string" ? body.query.trim() : ""
    if (!query) {
        return {
            status: 400,
            body: { ok: false, error: { error: "Query is required." } },
        }
    }

    const client = getBotClient()
    const enqueue = await searchAndEnqueue(client, guildId, requester.requesterId, query, guard)
    if (enqueue.ok === false) {
        return { status: enqueue.status, body: { ok: false, error: enqueue.error } }
    }

    return {
        status: 200,
        body: {
            ok: true,
            data: await toQueueResponse(guildId, enqueue.player),
        },
    }
}

export async function queueDELETE(
    headers: Headers,
    guildId: string
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.MANAGE_QUEUE])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const player = getBotClient().lavalink.getPlayer(guildId)
    try {
        if (player) {
            await player.queue.splice(0, player.queue.tracks.length)
        }
        return {
            status: 200,
            body: {
                ok: true,
                data: await toQueueResponse(guildId, player ?? null),
            },
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: message, details: message },
            },
        }
    }
}
