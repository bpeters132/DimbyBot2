import type { Player, Track, UnresolvedTrack } from "lavalink-client"
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

function reconnectPlayTarget(player: Player): Track | UnresolvedTrack | null {
    return player.queue.current ?? player.queue.tracks[0] ?? null
}

/**
 * After hydrate, resume with the live prepared current as `clientTrack`.
 * Stale autoReconnect `clientTrack` still has `encoded: ""` (ensureCurrentPlayable
 * replaces `queue.current`); passing it would skip the encoded-replace path.
 */
function playOptionsForPreparedCurrent(
    options: Parameters<PlayFn>[0],
    current: NonNullable<Player["queue"]["current"]>
): Parameters<PlayFn>[0] {
    return { ...(options ?? {}), clientTrack: current }
}

/**
 * Arms the next `player.play()` after lavalink-client emits `playerReconnect`.
 *
 * `onDisconnect.autoReconnect` connects, emits `playerReconnect` (listeners are not
 * awaited), then `play({ clientTrack })` or `play({ paused })` with no JIT prepare.
 * Must run synchronously inside the listener so the wrap is in place before that
 * `play()`. No-ops when current (or upcoming[0] if current is empty) is already ready.
 *
 * Distinct from trackEnd (#315) and trackStuck (#311) arms: those wrap library
 * autoSkip after a node event; this path never emits trackEnd/trackStuck first.
 */
export function armAutoReconnectPlayPrepare(
    player: Player,
    getLivePlayer: () => Player | undefined,
    config?: CompanionPlaybackConfig | null
): void {
    const head = reconnectPlayTarget(player)
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

        const readyHead = reconnectPlayTarget(liveBefore)
        if (readyHead && isYoutubePlaybackReady(readyHead) && liveBefore.queue.current) {
            return originalPlay(playOptionsForPreparedCurrent(options, liveBefore.queue.current))
        }
        if (readyHead && isYoutubePlaybackReady(readyHead)) {
            return originalPlay(options)
        }

        const prepared = await ensureCurrentPlayable(getLivePlayer, player.guildId, config)
        const live = getLivePlayer()
        if (!live || live !== player) return player

        if (prepared === "ok" && live.queue.current && isYoutubePlaybackReady(live.queue.current)) {
            return originalPlay(playOptionsForPreparedCurrent(options, live.queue.current))
        }

        if (prepared === "ok" && !live.queue.current) {
            const upcoming = live.queue.tracks[0]
            if (upcoming && isYoutubePlaybackReady(upcoming)) {
                return originalPlay(options)
            }
        }

        // Do not play encoded:"" — that null-stops the node and advances past this head
        // (and every subsequent unprepared metadata track). Retry prepare in the
        // background when the failure was transient; permanent drops already emptied
        // or replaced the head.
        if (prepared === "deferred") {
            void resumeWhenCurrentPrepared(live, getLivePlayer, originalPlay, options, config)
        } else if (live.queue.current && isYoutubePlaybackReady(live.queue.current)) {
            return originalPlay(playOptionsForPreparedCurrent(options, live.queue.current))
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
            await play(playOptionsForPreparedCurrent(options, live.queue.current))
        } else if (
            prepared === "ok" &&
            !live.queue.current &&
            live.queue.tracks[0] &&
            isYoutubePlaybackReady(live.queue.tracks[0])
        ) {
            await play(options)
        }
    } catch {
        // Best-effort resume after deferred companion/search; user skip still works.
    }
}
