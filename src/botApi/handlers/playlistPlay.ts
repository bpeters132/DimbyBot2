import { resolveWebRequesterDiscordId } from "../resolveWebRequesterId.js"
import { WebPermission } from "../../shared/permissions.js"
import type { ApiResponse } from "../../types/index.js"
import type { PlaylistPlayResponse } from "../../types/web.js"
import { requirePermissions } from "../../shared/api-auth.js"
import { getBotClient } from "../../lib/botClientRegistry.js"
import { toPlayerStateResponse } from "../../shared/player-state.js"
import { getPlaylistById } from "../../repositories/playlistRepository.js"
import { searchAndEnqueue } from "./searchAndEnqueue.js"
import {
    type EnqueuePlaylistResult,
    playerHasQueueContent,
    replaceUpcomingWithResolvedPlaylistTracks,
    resolveStoredPlaylistTracks,
} from "../../util/playlistQueue.js"
import {
    acquireGuildPlayerLifecycleReservation,
    tryDestroyOrphanGuildPlayer,
} from "../../util/guildPlayerQueueLock.js"
import { destroyPlayerSuppressingSessionClear } from "../../util/playerSessionPersistence.js"

export async function playerPlaylistPlayPOST(
    headers: Headers,
    guildId: string,
    rawBody: unknown
): Promise<{ status: number; body: ApiResponse<PlaylistPlayResponse> }> {
    try {
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
            playlistId?: unknown
            shuffle?: unknown
        }
        let playlistId: number
        if (typeof body.playlistId === "number") {
            if (
                !Number.isFinite(body.playlistId) ||
                !Number.isInteger(body.playlistId) ||
                body.playlistId < 1
            ) {
                return {
                    status: 400,
                    body: {
                        ok: false,
                        error: { error: "Bad request", details: "playlistId is required." },
                    },
                }
            }
            playlistId = body.playlistId
        } else if (
            typeof body.playlistId === "string" &&
            /^[1-9]\d*$/.test(body.playlistId.trim())
        ) {
            playlistId = Number.parseInt(body.playlistId.trim(), 10)
        } else {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: { error: "Bad request", details: "playlistId is required." },
                },
            }
        }
        if (!Number.isInteger(playlistId) || playlistId < 1) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: { error: "Bad request", details: "playlistId is required." },
                },
            }
        }

        const shuffle = body.shuffle === true

        const playlist = await getPlaylistById(playlistId)
        if (!playlist) {
            return {
                status: 404,
                body: {
                    ok: false,
                    error: { error: "Not found", details: "Playlist not found." },
                },
            }
        }
        if (playlist.userId !== guard.discordUserId) {
            return {
                status: 403,
                body: {
                    ok: false,
                    error: { error: "Forbidden", details: "You do not own this playlist." },
                },
            }
        }
        if (playlist.tracks.length === 0) {
            return {
                status: 400,
                body: {
                    ok: false,
                    error: { error: "Bad request", details: "Playlist has no tracks." },
                },
            }
        }

        const client = getBotClient()
        const requesterPayload = {
            id: requester.requesterId,
            username: guard.session.user?.name ?? "web-user",
        }

        // One continuous lease for connect + resolve + enqueue. Previously connectOnly
        // released its reservation before this acquire; deferred queueEnd idle destroy
        // (plain destroy → clearPlayerSession) could then run in that gap and wipe the
        // restorable session while playlistPlay still held a stale player reference.
        const lifecycleReservation = await acquireGuildPlayerLifecycleReservation(guildId)
        try {
            const voiceSetup = await searchAndEnqueue(
                client,
                guildId,
                requester.requesterId,
                "",
                guard,
                { connectOnly: true, externalLifecycleReservation: true }
            )
            if (voiceSetup.ok === false) {
                return { status: voiceSetup.status, body: { ok: false, error: voiceSetup.error } }
            }

            const player = voiceSetup.player
            const { resolved, failed } = await resolveStoredPlaylistTracks(
                player,
                playlist.tracks,
                requesterPayload
            )

            if (resolved.length === 0) {
                await tryDestroyOrphanGuildPlayer(guildId, {
                    hasQueueContent: () => {
                        const live = client.lavalink.getPlayer(guildId) ?? player
                        return playerHasQueueContent(live)
                    },
                    destroyPlayer: async () => {
                        await destroyPlayerSuppressingSessionClear(guildId, () =>
                            client.lavalink.destroyPlayer(guildId)
                        )
                    },
                })
                return {
                    status: 404,
                    body: {
                        ok: false,
                        error: {
                            error: "No matches found.",
                            details: "Could not resolve any tracks from this playlist.",
                        },
                    },
                }
            }

            // Clear + enqueue must share one guild lock so a concurrent queue POST cannot
            // succeed then be wiped by clearUpcoming between unlocked clear and locked add.
            const enqueue: EnqueuePlaylistResult = await replaceUpcomingWithResolvedPlaylistTracks(
                player,
                resolved,
                requester.requesterId,
                shuffle
            )

            const state = await toPlayerStateResponse(guildId, requester.requesterId, player)

            return {
                status: 200,
                body: {
                    ok: true,
                    data: {
                        state,
                        playlistId: playlist.id,
                        playlistName: playlist.name,
                        queued: enqueue.queued,
                        failed,
                        shuffle,
                    },
                },
            }
        } finally {
            lifecycleReservation.release()
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[playerPlaylistPlayPOST] unhandled error", { guildId, message })
        return {
            status: 500,
            body: {
                ok: false,
                error: { error: "Internal server error.", details: "An internal error occurred." },
            },
        }
    }
}
