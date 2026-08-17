/**
 * Destroys a Lavalink player from `/stop`, awaiting completion so failures cannot become
 * unhandled rejections (Node 24+ exits the process on those).
 */
export async function destroyLavalinkPlayerForStop(player: {
    destroy: () => Promise<unknown>
}): Promise<void> {
    await player.destroy()
}
