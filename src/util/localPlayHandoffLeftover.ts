/**
 * After a failed Lavalink → local handoff destroy, decide whether the guild's
 * live player is still the original handoff target (safe to tear down) or a
 * concurrent successor that must be left alone.
 *
 * lavalink-client `Player.destroy()` deletes the guild from the manager cache
 * *before* awaiting `node.destroyPlayer()`. If that await rejects, the handoff
 * reports `destroyedLavalink=false` while the slot is already empty — so
 * `getPlayer(guildId)` during the later local VC join (up to 30s) can return a
 * successor created by concurrent `/play` or dashboard enqueue. Destroying that
 * player (and clearing the session on Ready) would drop the live + persisted queue.
 */
export function shouldDestroyLeftoverHandoffPlayer(
    handoffPlayer: object,
    livePlayer: object | null | undefined
): boolean {
    return livePlayer != null && livePlayer === handoffPlayer
}

/**
 * On local Ready after a failed handoff destroy, only clear the flushed Lavalink
 * session when no different live player owns the guild slot.
 */
export function shouldClearSessionAfterFailedHandoffDestroy(
    handoffPlayer: object,
    livePlayer: object | null | undefined
): boolean {
    return livePlayer == null || livePlayer === handoffPlayer
}
