import type { Player } from "lavalink-client"
import type { CompanionPlaybackConfig } from "./youtubeCompanionPlayback.js"
import { ensureUpcomingHeadPlayable } from "./youtubePlaybackWindow.js"

type SkipPlayer = {
    guildId?: string
    queue: { tracks: { length: number } }
    skip: (skipTo?: number, throwError?: boolean) => Promise<unknown>
}

/**
 * Advances past the current track without using default `skip()`, which throws when the
 * upcoming queue is empty (lavalink-client). Matches `/skip`, control buttons, and web player.
 * When `guildId` is present, prepares upcoming[0] for YouTube playback first.
 */
export async function skipCurrentTrack(
    player: SkipPlayer,
    config?: CompanionPlaybackConfig | null
): Promise<void> {
    if (typeof player.guildId === "string") {
        const prepared = await ensureUpcomingHeadPlayable(
            () => player as Player,
            player.guildId,
            config
        )
        if (prepared === "deferred") return
    }
    if (player.queue.tracks.length > 0) {
        await player.skip()
        return
    }
    await player.skip(0, false)
}
