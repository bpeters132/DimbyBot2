import { sanitizeHttpUrl } from "./http-url.js"

/** Best-effort YouTube thumbnail when only a stored URI is available (e.g. legacy playlist rows). */
export function thumbnailUrlFromUri(uri: string): string | null {
    const trimmed = uri.trim()
    if (!trimmed) return null
    try {
        const parsed = new URL(trimmed)
        const host = parsed.hostname.toLowerCase()
        let id: string | null = null

        if (host === "youtu.be") {
            id = parsed.pathname.split("/").filter(Boolean)[0] ?? null
        } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
            if (parsed.pathname === "/watch" || parsed.pathname.endsWith("/watch")) {
                id = parsed.searchParams.get("v")
            } else {
                const parts = parsed.pathname.split("/").filter(Boolean)
                const kind = parts[0]
                const candidate = parts[1]
                if (kind === "embed" || kind === "v" || kind === "shorts") id = candidate ?? null
            }
        }

        if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return null
        return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    } catch {
        return null
    }
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
