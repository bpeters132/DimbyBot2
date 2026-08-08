import type { Player, SearchResult, Track, UnresolvedSearchResult } from "lavalink-client"

/**
 * If title starts with artist then a separator (-–—:|), returns the rest; otherwise null
 * (no dynamic RegExp from user data).
 */
export function titleAfterArtistPrefix(titleRaw: string, artistRaw: string): string | null {
    const title = titleRaw.trim().replace(/\s+/g, " ")
    const artist = artistRaw.trim().replace(/\s+/g, " ")
    if (!artist.length || !title.length) return null
    const tl = title.toLowerCase()
    const al = artist.toLowerCase()
    if (!tl.startsWith(al)) return null
    let i = artist.length
    while (i < title.length && title[i] === " ") i++
    if (i >= title.length) return null
    const sep = title[i]
    if (sep === undefined || !"-–—:|".includes(sep)) return null
    i++
    while (i < title.length && title[i] === " ") i++
    const rest = title.slice(i).trim()
    return rest.length > 0 ? rest : null
}

/**
 * Resolves artist/title used to seed autoplay search after a track ends.
 * Prefers the ended track, strips duplicated "Artist - Title" prefixes, then falls back to
 * queue.previous and the player's stored lastTrack metadata.
 */
export function resolveAutoplaySeed(
    player: Player,
    endedTrack: Track | undefined
): { artist: string; title: string } | null {
    let artist = endedTrack?.info?.author?.trim()
    let title = endedTrack?.info?.title?.trim()

    if (title && (!artist || /^unknown$/i.test(artist))) {
        const m = title.match(/^(.+?)\s*[-–—:|]\s*(.+)$/)
        if (m) {
            artist = m[1].trim()
            title = m[2].trim()
        }
    }

    if (title && artist && !/^unknown$/i.test(artist)) {
        const afterDup = titleAfterArtistPrefix(title, artist)
        if (afterDup) title = afterDup
    }

    if (!title) {
        const prev = player.queue.previous?.[0]
        artist = prev?.info?.author?.trim() || artist
        title = prev?.info?.title?.trim()
    }

    const stored = player.get("lastTrack") as { title?: string; artist?: string } | undefined
    if (stored && (!title || !artist)) {
        if (!title && stored.title) title = stored.title.trim()
        if (!artist) artist = (stored.artist || "").trim() || "Unknown Artist"
    }

    if (!title) return null
    if (!artist) artist = "Unknown Artist"
    return { artist, title }
}

/** Lavalink load types that may contain playable autoplay candidates. */
export function isAllowedSearchLoadType(
    searchResult: UnresolvedSearchResult | SearchResult | null | undefined
): boolean {
    const lt = searchResult?.loadType as string | undefined
    return (
        lt === "track" ||
        lt === "TRACK_LOADED" ||
        lt === "SEARCH_RESULT" ||
        lt === "search" ||
        lt === "playlist" ||
        lt === "PLAYLIST_LOADED"
    )
}

/**
 * True when autoplay may enqueue the next track: flag on, nothing current/queued, and not already playing.
 */
export function shouldStillInjectAutoplayTrack(player: Player): boolean {
    if (!player.get("autoplay")) return false
    if ((player.queue?.tracks?.length ?? 0) > 0) return false
    if (player.queue?.current) return false
    if (player.playing) return false
    return true
}
