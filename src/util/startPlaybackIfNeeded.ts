import type { Player } from "lavalink-client"
import { getLivePlayerIfUnchanged } from "./livePlayerIdentity.js"
import type { CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { ensureCurrentPlayable } from "./youtubePlaybackWindow.js"

/** Outcome of {@link startPlaybackIfNeeded}; `deferred` means play was not started. */
export type PlaybackStartResult = "ok" | "deferred" | "empty" | "no_player"

const playerStartLocks = new WeakMap<Player, Promise<PlaybackStartResult>>()

/**
 * Prevents concurrent check-then-play races by serializing start attempts per player.
 * After waiting on another caller’s lock, re-checks: that run may have left playback idle while
 * new tracks were enqueued, so we must not return without attempting start under our own lock.
 *
 * `getLivePlayer` must re-resolve the guild slot: companion prepare can outlive `/stop` + a
 * successor, and destroyed `Player.play()` still issues guild-keyed `node.updatePlayer` (no
 * destroy-status gate in lavalink-client). Optional `config` is for tests / callers that inject
 * companion fetch; production omits it.
 */
export async function startPlaybackIfNeeded(
    player: Player,
    getLivePlayer: () => Player | undefined | null,
    config?: CompanionPlaybackConfig | null
): Promise<PlaybackStartResult> {
    for (;;) {
        const existingLock = playerStartLocks.get(player)
        if (existingLock) {
            await existingLock
            continue
        }

        const startPromise = (async (): Promise<PlaybackStartResult> => {
            if (!getLivePlayerIfUnchanged(getLivePlayer, player)) return "no_player"
            const prepared = await ensureCurrentPlayable(
                () => getLivePlayerIfUnchanged(getLivePlayer, player) ?? undefined,
                player.guildId,
                config
            )
            if (prepared !== "ok") return prepared
            const live = getLivePlayerIfUnchanged(getLivePlayer, player)
            if (!live) return "no_player"
            if (!live.playing && (live.queue.current || live.queue.tracks.length > 0)) {
                await live.play()
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
