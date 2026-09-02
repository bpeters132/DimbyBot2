/**
 * After an await (e.g. Discord `deferReply` / `connect`), re-resolve the guild player and refuse
 * when the slot was destroyed or replaced. A stale `Player` can still mutate Lavalink / Discord
 * voice state via guild-keyed APIs (`Player.skip` → `node.updatePlayer({ guildId })`,
 * `Player.connect` → `sendToShard(guildId, …)`).
 */
export function getLivePlayerIfUnchanged<T>(
    getPlayer: () => T | undefined | null,
    expected: T
): T | null {
    const live = getPlayer()
    return live != null && live === expected ? live : null
}
