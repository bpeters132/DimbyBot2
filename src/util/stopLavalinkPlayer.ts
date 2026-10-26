import { withGuildPlayerQueueLock } from "./guildPlayerQueueLock.js"
import { forceClearPlayerSessionAfterDestroyIfSafe } from "./playerSessionPersistence.js"

/**
 * Destroys a Lavalink player from `/stop` (and control/web stop), awaiting completion so
 * failures cannot become unhandled rejections (Node 24+ exits the process on those).
 *
 * Holds the guild queue lock for the whole `destroy()` so a concurrent `/play` or
 * Dashboard enqueue (lifecycle reservation → `createPlayer`) cannot occupy the slot
 * after lavalink-client's `deletePlayer` and then be torn down by guild-keyed
 * `node.destroyPlayer`, and cannot enqueue onto a player mid-disconnect.
 * Same serialization as {@link runLocalHandoffLavalinkStopAndDestroy}.
 *
 * Also force-clears the persisted session when no successor owns the guild:
 * `playerDestroy` → `clearPlayerSession` is a no-op while session restore is in progress,
 * which would otherwise resurrect the stopped queue on the next Lavalink reconnect.
 * When a concurrent `/play` installed a successor during `destroy()`, skip force-clear
 * (same identity rule as `playerDestroy` skip-successor).
 */
export async function destroyLavalinkPlayerForStop(
    player: {
        guildId: string
        destroy: () => Promise<unknown>
    },
    getLivePlayer: () => object | null | undefined
): Promise<void> {
    await withGuildPlayerQueueLock(player.guildId, async () => {
        // A different live instance already owns the guild — never destroy the stale
        // reference (guild-keyed deletePlayer / node.destroyPlayer would hit the successor).
        // Empty slot (null) still runs destroy: a prior destroy may have early-returned, or
        // the mock/test getter is post-destroy-only; library destroy is idempotent via
        // internal_destroystatus.
        const live = getLivePlayer()
        if (live != null && live !== player) return
        await player.destroy()
    })
    await forceClearPlayerSessionAfterDestroyIfSafe(player.guildId, player, getLivePlayer)
}
