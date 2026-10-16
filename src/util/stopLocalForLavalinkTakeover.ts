import type BotClient from "../lib/BotClient.js"
import { cancelPendingLocalPlay, getLocalPlayerState, stopLocalPlayer } from "./localPlayer.js"

/**
 * Whether an existing local (@discordjs/voice) player must be stopped before a
 * Lavalink create/connect takeover. Any mapped local state counts — not only
 * `isPlaying` — so buffering/Idle entries cannot dual-play after connect.
 */
export function shouldStopLocalPlayerBeforeLavalinkTakeover(
    localState: unknown | null | undefined
): boolean {
    return localState != null
}

/**
 * Cancels an in-flight Play Local Ready wait and stops active local audio so a
 * Dashboard / control-channel Lavalink enqueue cannot steal Discord voice while
 * @discordjs/voice is still playing (or about to start).
 *
 * @returns True when an active local player was stopped.
 */
export async function stopLocalPlaybackForLavalinkTakeover(
    client: BotClient,
    guildId: string,
    settleMs = 500
): Promise<boolean> {
    cancelPendingLocalPlay(guildId)
    if (!shouldStopLocalPlayerBeforeLavalinkTakeover(getLocalPlayerState(guildId))) {
        return false
    }
    stopLocalPlayer(client, guildId)
    if (settleMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, settleMs))
    }
    return true
}
