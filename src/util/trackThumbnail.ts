import type { Track } from "lavalink-client"

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

/** Best-effort thumbnail when only a stored URI is available (e.g. legacy playlist rows). */
export function thumbnailUrlFromUri(uri: string): string | null {
    const trimmed = uri.trim()
    if (!trimmed) return null
    const match = trimmed.match(
        /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/
    )
    if (match?.[1]) {
        return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
    }
    return null
}
