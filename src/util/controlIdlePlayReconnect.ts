/**
 * Idle control play when the player may need Discord voice reconnect before play().
 * Distinct from the outer occupied-VC gate: reconnect is allowed only when the member
 * matches the player's bound `voiceChannelId` (not merely the bot's live Discord VC).
 */
export type ControlIdlePlayReconnectAction = "play" | "reconnect" | "refuse"

/**
 * Decide whether idle control play can call play(), must reconnect first, or must refuse.
 * When disconnected, reconnect only if the member is in the player's bound voice channel;
 * mismatch / missing channels refuse so we never connect() or play() from the wrong room.
 */
export function resolveControlIdlePlayReconnect(input: {
    playerConnected: boolean
    playerVoiceChannelId: string | null | undefined
    memberVoiceChannelId: string | null | undefined
}): ControlIdlePlayReconnectAction {
    if (input.playerConnected) return "play"
    // Match historical control-button gate: truthy member + player channel ids must be equal.
    if (
        input.memberVoiceChannelId &&
        input.playerVoiceChannelId &&
        input.memberVoiceChannelId === input.playerVoiceChannelId
    ) {
        return "reconnect"
    }
    return "refuse"
}
