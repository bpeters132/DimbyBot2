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
