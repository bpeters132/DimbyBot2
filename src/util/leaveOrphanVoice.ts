/**
 * True when /leave has no Lavalink player but the bot still occupies a Discord voice channel.
 * `destroyPlayer` is a no-op without a manager entry, so Discord must be disconnected explicitly.
 */
export function shouldDisconnectOrphanVoice(
    hasLavalinkPlayer: boolean,
    botInVoice: boolean
): boolean {
    return !hasLavalinkPlayer && botInVoice
}

/**
 * When /leave observed no Lavalink player at command start, whether it may still call
 * `destroyPlayer(guildId)` / force-clear. A concurrent `/play` can install a successor
 * after the null check; tearing that player down (or wiping its session) must not run.
 */
export function shouldTearDownAbsentLavalinkOnLeave(
    livePlayer: object | null | undefined
): boolean {
    return livePlayer == null
}
