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

/**
 * Voice channel the bot currently occupies for playback.
 * Prefers the live Discord voice state so local (@discordjs/voice) playback is
 * visible when the Lavalink player was destroyed.
 */
export function resolveOccupiedVoiceChannelId(
    guild: {
        members: {
            me?: {
                voice?: {
                    channelId?: string | null
                    channel?: { id: string } | null
                } | null
            } | null
        }
    },
    player?: { voiceChannelId?: string | null } | null
): string | null {
    const botVc = guild.members.me?.voice?.channelId ?? guild.members.me?.voice?.channel?.id ?? null
    const playerVc = player?.voiceChannelId ?? null
    return botVc || playerVc || null
}

/**
 * Whether a member in `memberVoiceChannelId` may take over / play into an occupied channel.
 * Empty occupation (bot idle, no player binding) is allowed.
 */
export function memberMayJoinOccupiedVoice(
    occupiedVoiceChannelId: string | null | undefined,
    memberVoiceChannelId: string
): boolean {
    if (!occupiedVoiceChannelId) return true
    return occupiedVoiceChannelId === memberVoiceChannelId
}
