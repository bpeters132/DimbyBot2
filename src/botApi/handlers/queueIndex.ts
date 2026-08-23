import { WebPermission } from "../../shared/permissions.js"
import type { ApiResponse } from "../../types/index.js"
import type { QueueResponse } from "../../types/web.js"
import { requirePermissions } from "../../shared/api-auth.js"
import { getBotClient, tryGetBotClient } from "../../lib/botClientRegistry.js"
import { toQueueResponse } from "../../shared/player-state.js"
import { playerBroadcaster } from "../../shared/websocket/PlayerBroadcaster.js"
import { scheduleSaveIfPlayerStillLive } from "../../util/playerSessionPersistence.js"
import { withGuildPlayerQueueLock } from "../../util/guildPlayerQueueLock.js"
import { parseQueueIndex } from "../parseBotApiParams.js"

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

        const queueIndex = parseQueueIndex(indexParam)
        if (queueIndex === null) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: { error: "Queue index must be a non-negative integer." },
                },
            }
        }

        const client = getBotClient()
        const removeResult = await withGuildPlayerQueueLock(guildId, async () => {
            // Re-resolve: concurrent /stop leaves a zombie; splicing+saving it resurrects the session.
            const live = client.lavalink.getPlayer(guildId)
            if (!live) return { ok: false as const, reason: "no_player" as const }
            if (queueIndex >= live.queue.tracks.length) {
                return { ok: false as const, reason: "out_of_range" as const }
            }
            await live.queue.splice(queueIndex, 1)
            scheduleSaveIfPlayerStillLive(() => client.lavalink.getPlayer(guildId), live)
            return { ok: true as const, player: live }
        })
        if (!removeResult.ok) {
            return {
                status: 404,
                body: {
                    ok: false,
                    error: {
                        error:
                            removeResult.reason === "no_player"
                                ? "No active player for this guild."
                                : "Queue index out of range.",
                    },
                },
            }
        }

        playerBroadcaster.broadcastPlayerEvent(guildId, removeResult.player, "queueUpdate")
        return {
            status: 200,
            body: {
                ok: true,
                data: await toQueueResponse(guildId, removeResult.player),
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
                error: { error: "Internal server error", details: "Internal server error" },
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

        const sourceIndex = parseQueueIndex(indexParam)
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

        const client = getBotClient()
        const reorderResult = await withGuildPlayerQueueLock(guildId, async () => {
            const live = client.lavalink.getPlayer(guildId)
            if (!live) {
                return { ok: false as const, error: "No active player for this guild." }
            }
            const trackCount = live.queue.tracks.length
            if (sourceIndex >= trackCount || destinationIndex >= trackCount) {
                return { ok: false as const, error: "Queue index out of range." }
            }

            const [track] = await live.queue.splice(sourceIndex, 1)
            if (!track) {
                return { ok: false as const, error: "Queue index out of range." }
            }
            const insertIndexRaw = destinationIndex
            const lenAfterRemove = live.queue.tracks.length
            const insertIndex = Math.min(Math.max(insertIndexRaw, 0), lenAfterRemove)
            try {
                await live.queue.splice(insertIndex, 0, track)
            } catch (insertErr: unknown) {
                try {
                    await live.queue.splice(sourceIndex, 0, track)
                } catch (restoreErr: unknown) {
                    const restoreMessage =
                        restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
                    const bot = tryGetBotClient()
                    if (bot) {
                        bot.error(
                            "[queueIndexPATCH] failed to restore track after reorder error",
                            {
                                guildId,
                                sourceIndex,
                                restoreMessage,
                                insertErr,
                            }
                        )
                    } else {
                        console.error(
                            "[queueIndexPATCH] failed to restore track after reorder error",
                            {
                                guildId,
                                sourceIndex,
                                restoreMessage,
                                insertErr,
                            }
                        )
                    }
                }
                throw insertErr
            }
            scheduleSaveIfPlayerStillLive(() => client.lavalink.getPlayer(guildId), live)
            return { ok: true as const, player: live }
        })

        if (!reorderResult.ok) {
            return {
                status: 404,
                body: { ok: false, error: { error: reorderResult.error } },
            }
        }

        playerBroadcaster.broadcastPlayerEvent(guildId, reorderResult.player, "queueUpdate")

        return {
            status: 200,
            body: {
                ok: true,
                data: await toQueueResponse(guildId, reorderResult.player),
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
                error: { error: "Internal server error", details: "Internal server error" },
            },
        }
    }
}
