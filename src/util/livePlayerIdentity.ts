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

/**
 * True when a `playerMove` event completes a connect wait for the expected player instance
 * into the target voice channel. A successor for the same guild must not resolve the wait.
 */
export function isExpectedPlayerMoveConfirm<T extends object>(
    movedPlayer: T,
    expectedPlayer: T,
    newChannelId: string | null,
    targetChannelId: string
): boolean {
    return movedPlayer === expectedPlayer && newChannelId === targetChannelId
}

/**
 * True when a `playerUpdate` event confirms the expected player is connected in the target channel.
 */
export function isExpectedPlayerUpdateConfirm<
    T extends { connected: boolean; voiceChannelId: string | null },
>(updatedPlayer: T, expectedPlayer: T, targetChannelId: string): boolean {
    return (
        updatedPlayer === expectedPlayer &&
        updatedPlayer.connected &&
        updatedPlayer.voiceChannelId === targetChannelId
    )
}
