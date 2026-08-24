import type { Player } from "lavalink-client"

const playerStartLocks = new WeakMap<Player, Promise<void>>()

/**
 * Prevents concurrent check-then-play races by serializing start attempts per player.
 * After waiting on another caller’s lock, re-checks: that run may have left playback idle while
 * new tracks were enqueued, so we must not return without attempting start under our own lock.
 */
export async function startPlaybackIfNeeded(player: Player): Promise<void> {
    for (;;) {
        const existingLock = playerStartLocks.get(player)
        if (existingLock) {
            await existingLock
            continue
        }

        const startPromise = (async () => {
            if (!player.playing && (player.queue.current || player.queue.tracks.length > 0)) {
                await player.play()
            }
        })()

        playerStartLocks.set(player, startPromise)
        try {
            await startPromise
        } finally {
            if (playerStartLocks.get(player) === startPromise) {
                playerStartLocks.delete(player)
            }
        }
        return
    }
}
