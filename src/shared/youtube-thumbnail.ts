import { sanitizeHttpUrl } from "./http-url.js"

/** Best-effort YouTube thumbnail when only a stored URI is available (e.g. legacy playlist rows). */
export function thumbnailUrlFromUri(uri: string): string | null {
    const trimmed = uri.trim()
    if (!trimmed) return null
    const match = trimmed.match(
        /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/
    )
    if (match?.[1]) {
        return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
    }
    return null
}

/** Stored artwork when available; YouTube URI fallback for older rows. Always http(s)-sanitized. */
export function playlistTrackThumbnailUrl(track: {
    thumbnailUrl: string | null
    uri: string
}): string | null {
    const stored = track.thumbnailUrl ? sanitizeHttpUrl(track.thumbnailUrl) : null
    if (stored) return stored
    return sanitizeHttpUrl(thumbnailUrlFromUri(track.uri))
}
