/**
 * After an await (e.g. Discord `deferReply`), re-resolve the guild player and refuse
 * when the slot was destroyed or replaced. A stale `Player` can still mutate Lavalink
 * state via guild-keyed node APIs (e.g. `Player.skip` → `node.updatePlayer({ guildId })`).
 */
export function getLivePlayerIfUnchanged<T>(
    getPlayer: () => T | undefined | null,
    expected: T
): T | null {
    const live = getPlayer()
    return live != null && live === expected ? live : null
}
