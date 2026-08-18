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
