import type { Player } from "lavalink-client"
import type { CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { ensureCurrentPlayable, isYoutubePlaybackReady } from "./youtubePlaybackWindow.js"

/**
 * True when `Player.play()` would send Lavalink `track.encoded: null` for this head.
 *
 * Empty string is falsy, so play coerces `encoded: ""` → `null`. Lavalink then `stop()`s,
 * emits `TrackEnd(stopped)`, and the library's trackEnd handler runs `queueTrackEnd` again —
 * skipping the JIT metadata head into `previous` (not session-persisted). Consecutive
 * unprepared heads cascade until a non-empty encoded track or an empty queue.
 */
export function playWouldSendNullEncoded(track: { encoded?: unknown } | null | undefined): boolean {
    if (!track) return true
    const encoded = track.encoded
    return typeof encoded !== "string" || encoded.length === 0
}

type PlayFn = Player["play"]

/**
 * Arms the next `player.play()` after lavalink-client's trackEnd `queueTrackEnd` so an
 * unprepared Queue-metadata head is hydrated before the library talks to the node.
 *
 * Must run synchronously inside the `trackEnd` listener (before emit returns): the library
 * does not await listeners before `autoSkip` `play()`. No-ops when current is already
 * playback-ready so normal advances are not wrapped.
 *
 * Distinct from trackStuck arming (#311): natural `finished` (and other advancing ends) use
 * this path; trackStuck's first `play` runs before any `trackEnd`.
 */
export function armLibraryAutoSkipPlayPrepare(
    player: Player,
    getLivePlayer: () => Player | undefined,
    config?: CompanionPlaybackConfig | null
): void {
    const head = player.queue.current
    if (!head || isYoutubePlaybackReady(head)) return

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
            return originalPlay(options)
        }

        const prepared = await ensureCurrentPlayable(getLivePlayer, player.guildId, config)
        const live = getLivePlayer()
        if (!live || live !== player) return player

        if (prepared === "ok" && live.queue.current && isYoutubePlaybackReady(live.queue.current)) {
            return originalPlay(options)
        }

        // Do not play encoded:"" — that null-stops the node and advances past this head (and
        // every subsequent unprepared metadata track). Retry prepare in the background when
        // the failure was transient; permanent drops already emptied or replaced the head.
        if (prepared === "deferred") {
            void resumeWhenCurrentPrepared(live, getLivePlayer, originalPlay, options, config)
        } else if (live.queue.current && isYoutubePlaybackReady(live.queue.current)) {
            return originalPlay(options)
        }
        return live
    }
}

async function resumeWhenCurrentPrepared(
    player: Player,
    getLivePlayer: () => Player | undefined,
    play: PlayFn,
    options: Parameters<PlayFn>[0],
    config?: CompanionPlaybackConfig | null
): Promise<void> {
    try {
        const prepared = await ensureCurrentPlayable(getLivePlayer, player.guildId, config)
        const live = getLivePlayer()
        if (!live || live !== player) return
        if (prepared === "ok" && live.queue.current && isYoutubePlaybackReady(live.queue.current)) {
            await play(options)
        }
    } catch {
        // Best-effort resume after deferred companion/search; user skip still works.
    }
}
