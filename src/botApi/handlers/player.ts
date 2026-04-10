import { WebPermission } from "../../web/shared/permissions.js"
import type { ApiResponse, PlayerStateResponse } from "../../web/types/web.js"
import { requirePermissions } from "../../web/lib/api-auth.js"
import { getBotClient } from "../../web/lib/botClient.js"
import { toPlayerStateResponse } from "../../web/lib/player-state.js"

type PlayerAction = "pause" | "skip" | "stop" | "seek" | "loop" | "shuffle" | "autoplay"

function parseAction(value: unknown): PlayerAction | null {
    const allowed: PlayerAction[] = ["pause", "skip", "stop", "seek", "loop", "shuffle", "autoplay"]
    if (typeof value !== "string") return null
    return allowed.includes(value as PlayerAction) ? (value as PlayerAction) : null
}

export async function playerGET(
    headers: Headers,
    guildId: string
): Promise<{ status: number; body: ApiResponse<PlayerStateResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.VIEW_PLAYER])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const player = getBotClient().lavalink.getPlayer(guildId)
    return {
        status: 200,
        body: {
            ok: true,
            data: toPlayerStateResponse(guildId, guard.discordUserId, player ?? null),
        },
    }
}

export async function playerPOST(
    headers: Headers,
    guildId: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<PlayerStateResponse> }> {
    const guard = await requirePermissions(headers, guildId, [WebPermission.CONTROL_PLAYBACK])
    if (guard.ok === false) {
        return {
            status: guard.status,
            body: { ok: false, error: { error: guard.error, details: guard.details } },
        }
    }

    const client = getBotClient()
    const player = client.lavalink.getPlayer(guildId)
    if (!player) {
        return {
            status: 404,
            body: { ok: false, error: { error: "No active player for this guild." } },
        }
    }

    const body = (typeof rawBody === "object" && rawBody !== null ? rawBody : {}) as {
        action?: unknown
        value?: unknown
    }
    const action = parseAction(body.action)
    if (!action) {
        return {
            status: 400,
            body: { ok: false, error: { error: "Invalid action." } },
        }
    }

    switch (action) {
        case "pause":
            if (player.playing) await player.pause()
            else if (player.paused) await player.resume()
            break
        case "skip":
            if (player.queue.tracks.length > 0) await player.skip()
            else await player.skip(0, false)
            break
        case "stop":
            await player.destroy()
            break
        case "seek":
            if (typeof body.value !== "number" || body.value < 0) {
                return {
                    status: 400,
                    body: { ok: false, error: { error: "Seek value must be a positive number." } },
                }
            }
            await player.seek(Math.floor(body.value))
            break
        case "loop": {
            const current = player.repeatMode
            const nextMode = current === "off" ? "track" : current === "track" ? "queue" : "off"
            await player.setRepeatMode(nextMode)
            break
        }
        case "shuffle":
            await player.queue.shuffle()
            break
        case "autoplay":
            player.set("autoplay", !player.get("autoplay"))
            break
    }

    const refreshedPlayer = client.lavalink.getPlayer(guildId)
    return {
        status: 200,
        body: {
            ok: true,
            data: toPlayerStateResponse(guildId, guard.discordUserId, refreshedPlayer ?? null),
        },
    }
}
