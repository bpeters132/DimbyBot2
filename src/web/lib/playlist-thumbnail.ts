import { sanitizeHttpUrl } from "@/lib/url-utils"

function thumbnailUrlFromUri(uri: string): string | null {
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

/** Stored artwork when available; YouTube URI fallback for older rows. */
export function playlistTrackThumbnailUrl(track: {
    thumbnailUrl: string | null
    uri: string
}): string | null {
    if (track.thumbnailUrl) {
        return sanitizeHttpUrl(track.thumbnailUrl)
    }
    return sanitizeHttpUrl(thumbnailUrlFromUri(track.uri))
}
