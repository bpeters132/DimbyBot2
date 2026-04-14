import { WebPermission } from "../../shared/permissions.js"
import type { ApiResponse } from "../../types/index.js"
import type { PlayerStateResponse } from "../../types/web.js"
import { requirePermissions } from "../../shared/api-auth.js"
import { getBotClient } from "../../lib/botClientRegistry.js"
import { toPlayerStateResponse } from "../../shared/player-state.js"
import { webPlayerDebug } from "../../shared/web-player-debug-log.js"

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

    try {
        const player = getBotClient().lavalink.getPlayer(guildId)
        const data = await toPlayerStateResponse(guildId, guard.discordUserId, player ?? null)
        webPlayerDebug("playerGET", {
            guildId,
            viewerIdPrefix: guard.discordUserId.slice(0, 8),
            inVoiceWithBot: data.inVoiceWithBot,
            currentRequesterId: data.currentTrack?.requesterId,
            currentRequesterUsername: data.currentTrack?.requesterUsername,
        })
        return {
            status: 200,
            body: {
                ok: true,
                data,
            },
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack : undefined
        webPlayerDebug("playerGET failed", { guildId, message, stack })
        return {
            status: 500,
            body: {
                ok: false,
                error: {
                    error: "internal_error",
                    details: "An internal error occurred.",
                },
            },
        }
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

    try {
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
                if (
                    typeof body.value !== "number" ||
                    !Number.isFinite(body.value) ||
                    body.value < 0
                ) {
                    return {
                        status: 400,
                        body: {
                            ok: false,
                            error: { error: "Seek value must be a positive number." },
                        },
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
                // Autoplay is Lavalink player session state (same as `/autoplay`); it is not persisted
                // to guild DB — toggling only affects this player until it is destroyed.
                player.set("autoplay", !player.get("autoplay"))
                break
        }

        const refreshedPlayer = action === "stop" ? null : client.lavalink.getPlayer(guildId)
        return {
            status: 200,
            body: {
                ok: true,
                data: await toPlayerStateResponse(guildId, guard.discordUserId, refreshedPlayer),
            },
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Player action failed."
        webPlayerDebug("playerPOST failed", { guildId, action, message })
        return {
            status: 500,
            body: {
                ok: false,
                error: {
                    error: "internal_error",
                    details: "An internal error occurred.",
                },
            },
        }
    }
}
