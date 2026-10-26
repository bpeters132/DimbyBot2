import type { Player } from "lavalink-client"
import type { CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { ensureCurrentPlayable, isYoutubePlaybackReady } from "./youtubePlaybackWindow.js"

/**
 * Whether DimbyBot's `trackStuck` listener should call `player.skip()` / {@link skipCurrentTrack}.
 *
 * lavalink-client emits `trackStuck` without awaiting listeners, then advances the queue itself
 * (`queueTrackEnd` + `play` when `autoSkip` is on, or nulls the track when upcoming is empty).
 * An application skip races that advance and can drop the next queued track.
 */
export function shouldApplicationSkipOnTrackStuck(): boolean {
    return false
}

/**
 * True when `Player.play()` would send Lavalink `track.encoded: null` for this head.
 *
 * Empty string is falsy, so play coerces `encoded: ""` → `null`. Lavalink then `stop()`s,
 * emits `TrackEnd(stopped)`, and the library's trackEnd handler runs `queueTrackEnd` again —
 * skipping the JIT metadata head into `previous` (not session-persisted).
 */
export function playWouldSendNullEncoded(track: { encoded?: unknown } | null | undefined): boolean {
    if (!track) return true
    const encoded = track.encoded
    return typeof encoded !== "string" || encoded.length === 0
}

type PlayFn = Player["play"]

/**
 * Arms the next `player.play()` after lavalink-client's trackStuck `queueTrackEnd` so an
 * unprepared Queue-metadata head is hydrated before the library talks to the node.
 *
 * Must run synchronously inside the `trackStuck` listener (before emit returns): the library
 * does not await listeners before `queueTrackEnd` + `play`.
 */
export function armTrackStuckPlayPrepare(
    player: Player,
    getLivePlayer: () => Player | undefined,
    config?: CompanionPlaybackConfig | null
): void {
    const originalPlay: PlayFn = player.play.bind(player)
    let consumed = false
    player.play = async (options) => {
        if (consumed) return originalPlay(options)
        consumed = true
        player.play = originalPlay

        const liveBefore = getLivePlayer()
        if (!liveBefore || liveBefore !== player) {
            return originalPlay(options)
        }

        if (liveBefore.queue.current && isYoutubePlaybackReady(liveBefore.queue.current)) {
            return originalPlay({ noReplace: false })
        }

        const prepared = await ensureCurrentPlayable(getLivePlayer, player.guildId, config)
        const live = getLivePlayer()
        if (!live || live !== player) return player

        if (prepared === "ok" && live.queue.current && isYoutubePlaybackReady(live.queue.current)) {
            return originalPlay({ noReplace: false })
        }

        // Do not play encoded:"" — that null-stops the node and double-advances past this head.
        // Stop stuck node audio without a second queueTrackEnd, then retry prepare in background.
        await stopNodeTrackWithoutAdvancing(live)
        if (prepared === "deferred") {
            void resumeWhenCurrentPrepared(live, getLivePlayer, originalPlay, config)
        }
        return live
    }
}

/**
 * `TrackEnd(stopped)` advances unless `repeatMode === "track"` and `internal_skipped` is unset.
 * Temporarily force track-repeat around the null-encoded stop so the stuck node track ends
 * without shifting the already-advanced JIT head into `previous`.
 */
async function stopNodeTrackWithoutAdvancing(player: Player): Promise<void> {
    const manager = player.LavalinkManager
    const previousMode = player.repeatMode as "off" | "track" | "queue"
    player.set("internal_skipped", false)
    if (previousMode !== "track") {
        await player.setRepeatMode("track")
    }

    let restored = false
    const restore = (): void => {
        if (restored) return
        restored = true
        if (previousMode !== "track") {
            void player.setRepeatMode(previousMode).catch(() => undefined)
        }
    }

    const onTrackEnd = (ended: Player): void => {
        if (ended !== player) return
        manager.off("trackEnd", onTrackEnd)
        restore()
    }
    manager.on("trackEnd", onTrackEnd)

    try {
        await player.node.updatePlayer({
            guildId: player.guildId,
            playerOptions: { track: { encoded: null } },
        })
    } catch (err: unknown) {
        manager.off("trackEnd", onTrackEnd)
        restore()
        throw err
    }

    const timeout = setTimeout(() => {
        manager.off("trackEnd", onTrackEnd)
        restore()
    }, 5000)
    timeout.unref?.()
}

async function resumeWhenCurrentPrepared(
    player: Player,
    getLivePlayer: () => Player | undefined,
    play: PlayFn,
    config?: CompanionPlaybackConfig | null
): Promise<void> {
    try {
        const prepared = await ensureCurrentPlayable(getLivePlayer, player.guildId, config)
        const live = getLivePlayer()
        if (!live || live !== player) return
        if (prepared === "ok" && live.queue.current && isYoutubePlaybackReady(live.queue.current)) {
            await play({ noReplace: false })
        }
    } catch {
        // Best-effort resume after deferred companion/search; user skip still works.
    }
}
