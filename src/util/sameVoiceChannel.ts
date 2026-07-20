/**
 * Whether a member in `memberVoiceChannelId` may control a player in `playerVoiceChannelId`.
 * Matches Skip / control-button semantics: missing player channel is treated as allowed.
 */
export function memberMayControlPlayerVoice(
    playerVoiceChannelId: string | null | undefined,
    memberVoiceChannelId: string
): boolean {
    if (!playerVoiceChannelId) return true
    return playerVoiceChannelId === memberVoiceChannelId
}
