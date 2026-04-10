import type { Player } from "lavalink-client"
import type { PlayerUpdateMessage } from "../types/web.js"
import { getBotClient } from "../lib/botClient.js"
import {
    summarizeVoiceForWeb,
    toPlayerStateResponse,
    toQueueTrackSummary,
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
        connectionManager.broadcastWithResolver(guildId, (userId) => {
            const p = player as Player | null
            const message: PlayerUpdateMessage = {
                type,
                guildId,
                state: toPlayerStateResponse(guildId, userId, p),
                queue: (p?.queue?.tracks ?? []).map(toQueueTrackSummary),
            }
            return message
        })
    }

    /** Push voice-related dashboard fields to every subscribed user (bot moves use the bot’s id, not the viewer’s). */
    broadcastGuildVoiceState(guildId: string): void {
        const player = getBotClient().lavalink.getPlayer(guildId) ?? null
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
    }
}

export const playerBroadcaster = new PlayerBroadcaster()
