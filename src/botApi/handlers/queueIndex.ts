import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse } from "../../types/index.js"
import type { QueueResponse } from "../../types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient, tryGetBotClient } from "../../lib/botClientRegistry.js"
import { toQueueResponse } from "../../web/lib/player-state.js"
import { playerBroadcaster } from "../../web/websocket/PlayerBroadcaster.js"

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
    try {
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
                body: {
                    ok: false,
                    error: { error: "Queue index must be a non-negative integer." },
                },
            }
        }

        const player = getBotClient().lavalink.getPlayer(guildId)
        if (!player || queueIndex >= player.queue.tracks.length) {
            return {
                status: 404,
                body: { ok: false, error: { error: "Queue index out of range." } },
            }
        }

        await player.queue.splice(queueIndex, 1)
        playerBroadcaster.broadcastPlayerEvent(guildId, player, "queueUpdate")
        return {
            status: 200,
            body: {
                ok: true,
                data: await toQueueResponse(guildId, player),
            },
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const client = tryGetBotClient()
        if (client) {
            client.error("[queueIndexDELETE] unhandled error", { guildId, message, err })
        } else {
            console.error("[queueIndexDELETE] unhandled error", { guildId, message, err })
        }
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Internal server error", details: message },
            },
        }
    }
}

export async function queueIndexPATCH(
    headers: Headers,
    guildId: string,
    indexParam: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<QueueResponse> }> {
    try {
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
            typeof body.newIndex === "number" && Number.isInteger(body.newIndex)
                ? body.newIndex
                : null

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

        const [track] = await player.queue.splice(sourceIndex, 1)
        const insertIndexRaw =
            destinationIndex > sourceIndex ? destinationIndex - 1 : destinationIndex
        const lenAfterRemove = player.queue.tracks.length
        const insertIndex = Math.min(Math.max(insertIndexRaw, 0), lenAfterRemove)
        await player.queue.splice(insertIndex, 0, track)
        playerBroadcaster.broadcastPlayerEvent(guildId, player, "queueUpdate")

        return {
            status: 200,
            body: {
                ok: true,
                data: await toQueueResponse(guildId, player),
            },
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        const client = tryGetBotClient()
        if (client) {
            client.error("[queueIndexPATCH] unhandled error", { guildId, message, err })
        } else {
            console.error("[queueIndexPATCH] unhandled error", { guildId, message, err })
        }
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Internal server error", details: message },
            },
        }
    }
}
