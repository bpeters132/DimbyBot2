import { forceClearPlayerSession } from "./playerSessionPersistence.js"

/**
 * Destroys a Lavalink player from `/stop`, awaiting completion so failures cannot become
 * unhandled rejections (Node 24+ exits the process on those).
 *
 * Also force-clears the persisted session: `playerDestroy` → `clearPlayerSession` is a no-op
 * while session restore is in progress, which would otherwise resurrect the stopped queue
 * on the next Lavalink reconnect (Leave already force-clears for the same reason).
 */
export async function destroyLavalinkPlayerForStop(player: {
    guildId: string
    destroy: () => Promise<unknown>
}): Promise<void> {
    await player.destroy()
    await forceClearPlayerSession(player.guildId)
}
