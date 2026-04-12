import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse } from "../../types/apiPayloads.js"
import type { QueueResponse } from "../../types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import { toQueueResponse } from "../../web/lib/player-state.js"

function parseIndex(value: string): number | null {
    const index = Number(value)
    if (!Number.isInteger(index) || index < 0) {
        return null
    }
    return index
}

export async function queueIndexDELETE(
    headers: Headers,
    guildId: string,
    indexParam: string
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.MANAGE_QUEUE])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const queueIndex = parseIndex(indexParam)
    if (queueIndex === null) {
        return {
            status: 400,
            body: { ok: false, error: { error: "Queue index must be a non-negative integer." } },
        }
    }

    const player = getBotClient().lavalink.getPlayer(guildId)
    if (!player || queueIndex >= player.queue.tracks.length) {
        return {
            status: 404,
            body: { ok: false, error: { error: "Queue index out of range." } },
        }
    }

    player.queue.splice(queueIndex, 1)
    return {
        status: 200,
        body: {
            ok: true,
            data: await toQueueResponse(guildId, player),
        },
    }
}

export async function queueIndexPATCH(
    headers: Headers,
    guildId: string,
    indexParam: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.MANAGE_QUEUE])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const sourceIndex = parseIndex(indexParam)
    const body = (typeof rawBody === "object" && rawBody !== null ? rawBody : {}) as {
        newIndex?: unknown
    }
    const destinationIndex =
        typeof body.newIndex === "number" && Number.isInteger(body.newIndex) ? body.newIndex : null

    if (sourceIndex === null || destinationIndex === null || destinationIndex < 0) {
        return {
            status: 400,
            body: {
                ok: false,
                error: { error: "Both queue indexes must be non-negative integers." },
            },
        }
    }

    const player = getBotClient().lavalink.getPlayer(guildId)
    if (!player) {
        return {
            status: 404,
            body: { ok: false, error: { error: "No active player for this guild." } },
        }
    }

    const trackCount = player.queue.tracks.length
    if (sourceIndex >= trackCount || destinationIndex >= trackCount) {
        return {
            status: 404,
            body: { ok: false, error: { error: "Queue index out of range." } },
        }
    }

    const [track] = player.queue.splice(sourceIndex, 1)
    player.queue.splice(destinationIndex, 0, track)

    return {
        status: 200,
        body: {
            ok: true,
            data: await toQueueResponse(guildId, player),
        },
    }
}
