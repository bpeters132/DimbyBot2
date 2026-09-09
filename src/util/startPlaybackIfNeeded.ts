import type { Player } from "lavalink-client"
import type { CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { ensureCurrentPlayable } from "./youtubePlaybackWindow.js"

/** Outcome of {@link startPlaybackIfNeeded}; `deferred` means play was not started. */
export type PlaybackStartResult = "ok" | "deferred" | "empty" | "no_player"

const playerStartLocks = new WeakMap<Player, Promise<PlaybackStartResult>>()

/**
 * Prevents concurrent check-then-play races by serializing start attempts per player.
 * After waiting on another caller’s lock, re-checks: that run may have left playback idle while
 * new tracks were enqueued, so we must not return without attempting start under our own lock.
 * Optional `config` is for tests / callers that inject companion fetch; production omits it.
 */
export async function startPlaybackIfNeeded(
    player: Player,
    config?: CompanionPlaybackConfig | null
): Promise<PlaybackStartResult> {
    for (;;) {
        const existingLock = playerStartLocks.get(player)
        if (existingLock) {
            await existingLock
            continue
        }

        const startPromise = (async (): Promise<PlaybackStartResult> => {
            const prepared = await ensureCurrentPlayable(() => player, player.guildId, config)
            if (prepared !== "ok") return prepared
            if (!player.playing && (player.queue.current || player.queue.tracks.length > 0)) {
                await player.play()
            }
            return "ok"
        })()

        playerStartLocks.set(player, startPromise)
        try {
            return await startPromise
        } finally {
            if (playerStartLocks.get(player) === startPromise) {
                playerStartLocks.delete(player)
            }
        }
    }
}
