/**
 * Policy for `LavalinkManager.players` after `await player.destroy()`.
 *
 * In lavalink-client, `Player.destroy()` deletes the guild from the manager cache
 * *before* awaiting `node.destroyPlayer()`. A concurrent `createPlayer` can occupy
 * that slot during the await. Calling `players.delete(guildId)` after destroy
 * resolves would drop that successor from the map without destroying it.
 *
 * @param playerStillInManagerAfterDestroy - Whether `players.has(guildId)` after destroy.
 *   `true` means a concurrent successor already replaced the destroyed player.
 * @returns Always `false` — never delete after destroy.
 */
export function shouldDeleteLavalinkPlayerAfterDestroy(
    playerStillInManagerAfterDestroy: boolean
): boolean {
    void playerStillInManagerAfterDestroy
    return false
}
