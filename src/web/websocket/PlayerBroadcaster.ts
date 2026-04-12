import type { PlayerUpdateMessage, QueueUpdateMessage } from "../types/web.js"
import { tryGetBotClient } from "../lib/botClient.js"
import {
    buildPlayerBroadcastData,
    composePlayerStateResponse,
    summarizeVoiceForWeb,
} from "../lib/player-state.js"
import { connectionManager } from "./ConnectionManager.js"

type BroadcastEventType =
    | "trackStart"
    | "trackEnd"
    | "playerPause"
    | "playerResume"
    | "queueUpdate"
    | "playerDestroy"

class PlayerBroadcaster {
    /** `player` is typed loosely so bot code and web code can share broadcasts across one lavalink-client install or two. */
    broadcastPlayerEvent(guildId: string, player: unknown, type: BroadcastEventType): void {
        void this.dispatchPlayerEvent(guildId, player, type)
    }

    private async dispatchPlayerEvent(
        guildId: string,
        player: unknown,
        type: BroadcastEventType
    ): Promise<void> {
        try {
            const {
                player: p,
                queueSummaries,
                currentTrack,
            } = await buildPlayerBroadcastData(guildId, player)

            connectionManager.broadcastWithResolver(guildId, (userId) => {
                try {
                    const state = composePlayerStateResponse(guildId, userId, p, currentTrack)
                    if (type === "queueUpdate") {
                        const queueMessage: QueueUpdateMessage = {
                            type: "queueUpdate",
                            guildId,
                            state,
                            queue: queueSummaries,
                        }
                        return queueMessage
                    }
                    const message: PlayerUpdateMessage = {
                        type,
                        guildId,
                        state,
                        queue: queueSummaries,
                    }
                    return message
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error)
                    console.error("[PlayerBroadcaster] Failed to build player event payload", {
                        guildId,
                        type,
                        userId,
                        message,
                    })
                    return null
                }
            })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            console.error("[PlayerBroadcaster] Failed to resolve requester names for broadcast", {
                guildId,
                type,
                message,
            })
        }
    }

    /** Push voice-related dashboard fields to every subscribed user (bot moves use the bot’s id, not the viewer’s). */
    broadcastGuildVoiceState(guildId: string): void {
        try {
            const client = tryGetBotClient()
            if (!client?.lavalink) {
                return
            }
            const player = client.lavalink.getPlayer(guildId) ?? null
            connectionManager.broadcastWithResolver(guildId, (socketUserId) => {
                const { inVoiceWithBot, botInVoiceChannel, canQueueTracks } = summarizeVoiceForWeb(
                    guildId,
                    socketUserId,
                    player
                )
                return {
                    type: "voiceStateChange",
                    guildId,
                    userId: socketUserId,
                    inVoiceWithBot,
                    botInVoiceChannel,
                    canQueueTracks,
                }
            })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            console.error("[PlayerBroadcaster] broadcastGuildVoiceState failed", {
                guildId,
                message,
            })
        }
    }
}

export const playerBroadcaster = new PlayerBroadcaster()
