import {
    forceClearPlayerSessionAfterDestroyIfSafe,
} from "./playerSessionPersistence.js"

/**
 * Destroys a Lavalink player from `/stop` (and control/web stop), awaiting completion so
 * failures cannot become unhandled rejections (Node 24+ exits the process on those).
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
    await player.destroy()
    await forceClearPlayerSessionAfterDestroyIfSafe(player.guildId, player, getLivePlayer())
}
