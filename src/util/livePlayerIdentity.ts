import type { Player } from "lavalink-client"

/**
 * True when the guild's manager still holds the same Player instance we started work on.
 * Existence-only `getPlayer(guildId)` is not enough: after `/stop` + a new `/play`, it returns
 * a successor — mutating that session pollutes the new queue / persisted snapshot.
 */
export function isSameLivePlayer(
    live: Player | null | undefined,
    expected: Player
): live is Player {
    return live != null && live === expected
}

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
