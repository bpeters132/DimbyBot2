import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { AdminMetricsPlayerSummary } from "../types/web.js"

/** Maps Lavalink player flags to the admin metrics status enum. */
export function playerStatus(player: Player): "playing" | "paused" | "idle" {
    if (player.playing) return "playing"
    if (player.paused) return "paused"
    return "idle"
}

/** Safe current-track summary for admin metrics (blank titles become Unknown). */
export function currentTrackSummary(
    track: Track | UnresolvedTrack | null | undefined
): AdminMetricsPlayerSummary["currentTrack"] {
    if (!track?.info) return null
    const info = track.info
    const title =
        typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Unknown"
    const author =
        typeof info.author === "string" && info.author.trim() ? info.author.trim() : undefined
    const uri = typeof info.uri === "string" && info.uri.trim() ? info.uri.trim() : undefined
    return { title, author, uri }
}
