import type BotClient from "../lib/BotClient.js"
import {
    cancelPendingLocalPlay,
    getLocalPlayerState,
    isPendingLocalPlay,
    stopLocalPlayer,
} from "./localPlayer.js"

/** Outcome of tearing down local / pending-local for an explicit user Stop. */
export type StopLocalForUserStopResult = {
    cancelledPending: boolean
    stoppedLocal: boolean
}

/**
 * Cancel in-flight Play Local and stop mapped `@discordjs/voice` state for `/stop`,
 * control Stop, and Dashboard stop.
 *
 * Control/Dashboard stop previously only destroyed Lavalink. After handoff destroy the
 * manager slot is empty, so those paths returned "player not found" / 404 while the
 * Ready wait continued and local audio still started — and a concurrent control Stop
 * during flush could force-clear the session without cancelling that wait.
 */
export function stopLocalPlaybackForUserStop(
    client: BotClient,
    guildId: string
): StopLocalForUserStopResult {
    let cancelledPending = false
    if (isPendingLocalPlay(guildId)) {
        cancelPendingLocalPlay(guildId)
        cancelledPending = true
    }
    let stoppedLocal = false
    if (getLocalPlayerState(guildId) != null) {
        stoppedLocal = stopLocalPlayer(client, guildId)
    }
    return { cancelledPending, stoppedLocal }
}

/** True when Stop should report success even with no Lavalink player. */
export function userStopAffectedLocalPlayback(result: StopLocalForUserStopResult): boolean {
    return result.cancelledPending || result.stoppedLocal
}
