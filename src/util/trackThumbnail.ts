import type { Track } from "lavalink-client"
import { thumbnailUrlFromUri } from "../shared/youtube-thumbnail.js"

export { thumbnailUrlFromUri } from "../shared/youtube-thumbnail.js"

/** Lavalink artwork URL or YouTube fallback from resolved track info. */
export function thumbnailFromLavalinkTrack(track: Track): string | null {
    const info = track.info
    if (info.artworkUrl) {
        return info.artworkUrl
    }
    if (info.identifier && info.sourceName === "youtube") {
        return `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg`
    }
    return thumbnailUrlFromUri(info.uri ?? "")
}
