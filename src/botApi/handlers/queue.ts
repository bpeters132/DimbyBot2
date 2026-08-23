import { resolveWebRequesterDiscordId } from "../resolveWebRequesterId.js"
import { WebPermission } from "../../shared/permissions.js"
import type { ApiResponse } from "../../types/index.js"
import type { QueueResponse } from "../../types/web.js"
import { requirePermissions } from "../../shared/api-auth.js"
import { getBotClient } from "../../lib/botClientRegistry.js"
import { toQueueResponse } from "../../shared/player-state.js"
import { playerBroadcaster } from "../../shared/websocket/PlayerBroadcaster.js"
import { searchAndEnqueue } from "./searchAndEnqueue.js"
import { clearUpcomingOnLivePlayer } from "../../util/livePlayerQueueMutations.js"
import { parseQueueQueryNumber } from "../parseBotApiParams.js"

const MAX_QUEUE_PAGE_LIMIT = 100

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

    const page = parseQueueQueryNumber(searchParams.get("page"), 1, 1, 10_000)
    const limit = parseQueueQueryNumber(searchParams.get("limit"), 20, 1, MAX_QUEUE_PAGE_LIMIT)
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
    try {
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
    } catch (err: unknown) {
        console.error("[queuePOST] unhandled error", err)
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Internal server error" },
            },
        }
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

    const client = getBotClient()
    try {
        // Re-resolve under the lock: concurrent stop destroys the captured player; splicing and
        // saving that zombie would resurrect the session after clearPlayerSession.
        await clearUpcomingOnLivePlayer(() => client.lavalink.getPlayer(guildId), guildId)
        const live = client.lavalink.getPlayer(guildId)
        if (live) {
            playerBroadcaster.broadcastPlayerEvent(guildId, live, "queueUpdate")
        }
        return {
            status: 200,
            body: {
                ok: true,
                data: await toQueueResponse(guildId, live ?? null),
            },
        }
    } catch (err: unknown) {
        console.error("[queueDELETE] unhandled error", err)
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Internal server error" },
            },
        }
    }
}
