import { forceClearPlayerSessionAfterDestroyIfSafe } from "./playerSessionPersistence.js"

/**
 * Destroys a Lavalink player from `/stop`, `/leave`, and control/web stop, awaiting
 * completion so failures cannot become unhandled rejections (Node 24+ exits on those).
 *
 * Also force-clears the persisted session when no live player owns the guild:
 * `playerDestroy` → `clearPlayerSession` is a no-op while session restore is in progress,
 * which would otherwise resurrect the stopped queue on the next Lavalink reconnect.
 *
 * Force-clear runs in `finally` so a throw from `node.destroyPlayer` after the manager
 * cache delete (lavalink-client emits `playerDestroy` only after that await) cannot skip
 * the clear and leave a durable row for restore. When destroy fails earlier and the same
 * player is still live, {@link forceClearPlayerSessionAfterDestroyIfSafe} no-ops.
 * A concurrent `/play` successor also skips force-clear (same identity rule as
 * `playerDestroy` skip-successor).
 */
export async function destroyLavalinkPlayerForStop(
    player: {
        guildId: string
        destroy: () => Promise<unknown>
    },
    getLivePlayer: () => object | null | undefined
): Promise<void> {
    try {
        await player.destroy()
    } finally {
        await forceClearPlayerSessionAfterDestroyIfSafe(player.guildId, player, getLivePlayer)
    }
}
