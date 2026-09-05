import type { Player } from "lavalink-client"
import type { CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { ensureUpcomingHeadPlayable } from "./youtubePlaybackWindow.js"

type SkipPlayer = {
    guildId?: string
    queue: { tracks: { length: number } }
    skip: (skipTo?: number, throwError?: boolean) => Promise<unknown>
}

export type SkipCurrentTrackResult = "skipped" | "deferred" | "stale"

/**
 * Advances past the current track without using default `skip()`, which throws when the
 * upcoming queue is empty (lavalink-client). Matches `/skip`, control buttons, and web player.
 * When `guildId` is present, prepares upcoming[0] for YouTube playback first.
 * Returns `deferred` when that prepare is transient so callers do not report a successful skip.
 * Returns `stale` when `getLivePlayer` shows a destroy/replace during prepare — `Player.skip`
 * is guild-keyed and must not run on a successor session.
 */
export async function skipCurrentTrack(
    player: SkipPlayer,
    config?: CompanionPlaybackConfig | null,
    getLivePlayer?: () => SkipPlayer | undefined | null
): Promise<SkipCurrentTrackResult> {
    const resolve = getLivePlayer ?? (() => player)
    if (typeof player.guildId === "string") {
        const prepared = await ensureUpcomingHeadPlayable(
            () => (resolve() as Player | undefined | null) ?? undefined,
            player.guildId,
            config
        )
        if (prepared === "deferred") return "deferred"
        if (prepared === "no_player") return "stale"
    }
    const live = resolve()
    if (!live || live !== player) return "stale"
    if (live.queue.tracks.length > 0) {
        await live.skip()
        return "skipped"
    }
    await live.skip(0, false)
    return "skipped"
}
