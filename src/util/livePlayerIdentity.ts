/**
 * True when the guild's manager still holds the same Player instance we started work on.
 * Existence-only `getPlayer(guildId)` is not enough: after `/stop` + a new `/play`, it returns
 * a successor — mutating that session pollutes the new queue / persisted snapshot.
 */
export function isSameLivePlayer<T extends object>(
    live: T | null | undefined,
    expected: T
): live is T {
    return live != null && live === expected
}

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
