import { resolveWebRequesterDiscordId } from "../resolveWebRequesterId.js"
import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse } from "../../types/index.js"
import type { PlayerStateResponse } from "../../types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import { toPlayerStateResponse } from "../../web/lib/player-state.js"
import { searchAndEnqueue } from "./searchAndEnqueue.js"

export async function playerPlayPOST(
    headers: Headers,
    guildId: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<PlayerStateResponse> }> {
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

    try {
        const client = getBotClient()
        const enqueue = await searchAndEnqueue(client, guildId, requester.requesterId, query, guard)
        if (enqueue.ok === false) {
            return { status: enqueue.status, body: { ok: false, error: enqueue.error } }
        }

        return {
            status: 200,
            body: {
                ok: true,
                data: await toPlayerStateResponse(guildId, requester.requesterId, enqueue.player),
            },
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[playerPlayPOST] unhandled error", { guildId, message })
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Internal server error." },
            },
        }
    }
}
