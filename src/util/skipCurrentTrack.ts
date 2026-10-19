import type { Player } from "lavalink-client"
import type { CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { createGuildAsyncChain } from "./guildAsyncChain.js"
import { ensureUpcomingHeadPlayable } from "./youtubePlaybackWindow.js"

type SkipPlayer = {
    guildId?: string
    queue: {
        tracks: { length: number }
        current?: { info?: { uri?: string | null } } | null
    }
    skip: (skipTo?: number, throwError?: boolean) => Promise<unknown>
}

export type SkipCurrentTrackResult = "skipped" | "deferred" | "stale"

/**
 * Serializes the identity-check + `skip()` critical section per guild.
 * Must not use {@link withGuildPlayerQueueLock}: `skip(0, false)` can run autoplay inject
 * which already takes that non-reentrant chain (deadlock).
 */
const withGuildSkipAdvanceChain = createGuildAsyncChain()

/** Same URI key as {@link queueTrackIdentity} — kept local so test hooks need not re-export it. */
function currentTrackIdentity(player: SkipPlayer): string | null {
    const uri = player.queue.current?.info?.uri
    if (typeof uri !== "string") return null
    const trimmed = uri.trim()
    if (!trimmed) return null
    return trimmed.toLowerCase().replace(/\/+$/, "")
}

/**
 * Advances past the current track without using default `skip()`, which throws when the
 * upcoming queue is empty (lavalink-client). Matches `/skip`, control buttons, and web player.
 * When `guildId` is present, prepares upcoming[0] for YouTube playback first.
 * Returns `deferred` when that prepare is transient so callers do not report a successful skip.
 * Returns `stale` when `getLivePlayer` shows a destroy/replace during prepare — `Player.skip`
 * is guild-keyed and must not run on a successor session.
 *
 * Concurrent skips (Discord + control + dashboard) share a long companion-prepare window.
 * Without an identity gate, two `skip()` calls both advance and permanently drop the next
 * queued track. After prepare, only the first waiter whose intended current is still live
 * advances; later waiters treat the already-moved head as a successful skip.
 */
export async function skipCurrentTrack(
    player: SkipPlayer,
    config?: CompanionPlaybackConfig | null,
    getLivePlayer?: () => SkipPlayer | undefined | null
): Promise<SkipCurrentTrackResult> {
    const resolve = getLivePlayer ?? (() => player)
    const guildId = typeof player.guildId === "string" ? player.guildId : undefined

    if (!guildId) {
        if (player.queue.tracks.length > 0) {
            await player.skip()
            return "skipped"
        }
        await player.skip(0, false)
        return "skipped"
    }

    const atStart = resolve()
    if (!atStart || atStart !== player) return "stale"
    const intendedCurrentIdentity = currentTrackIdentity(atStart)

    const prepared = await ensureUpcomingHeadPlayable(
        () => (resolve() as Player | undefined | null) ?? undefined,
        guildId,
        config
    )
    if (prepared === "deferred") return "deferred"
    if (prepared === "no_player") return "stale"

    return withGuildSkipAdvanceChain(guildId, async () => {
        const live = resolve()
        if (!live || live !== player) return "stale"
        // Another skip / natural advance already left the track we intended to skip.
        if (currentTrackIdentity(live) !== intendedCurrentIdentity) {
            return "skipped"
        }
        if (live.queue.tracks.length > 0) {
            await live.skip()
            return "skipped"
        }
        await live.skip(0, false)
        return "skipped"
    })
}
