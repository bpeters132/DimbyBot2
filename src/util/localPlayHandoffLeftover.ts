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

/**
 * Abort starting local playback when a Lavalink player owns the guild that is
 * not the confirmation-time handoff target.
 *
 * Trigger: local-match UI awaits up to 30s; `/stop` then `/play` installs a
 * successor. Confirming "Play Local" with the stale Player would
 * `schedulePlayerSessionSave`+flush the zombie's queue over the successor's
 * session and `joinVoiceChannel` would steal Discord voice from the live player.
 *
 * - Live null → safe (empty slot).
 * - Handoff null but live exists → abort (would steal voice without tearing down).
 * - Live !== handoff → abort (successor / replacement).
 */
export function shouldAbortLocalPlayForLivePlayerConflict(
    handoffPlayer: object | null | undefined,
    livePlayer: object | null | undefined
): boolean {
    if (livePlayer == null) return false
    if (handoffPlayer == null) return true
    return livePlayer !== handoffPlayer
}
