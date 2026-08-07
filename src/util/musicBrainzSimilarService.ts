/**
 * Similar tracks for autoplay using the MusicBrainz Web Service (no Spotify).
 * @see https://musicbrainz.org/doc/MusicBrainz_API — rate limit ~1 req/s; User-Agent required.
 */

import { escapeLucenePhrase } from "./escapeLucenePhrase.js"

const MB_ROOT = "https://musicbrainz.org/ws/2"

let lastMbRequestAt = 0
const MB_MIN_INTERVAL_MS = 1100

function hasMusicBrainzContact() {
    return !!(
        process.env.MUSICBRAINZ_CONTACT?.trim() || process.env.MUSICBRAINZ_CONTACT_URL?.trim()
    )
}

/**
 * True when MusicBrainz similar-track lookup is off (`MUSICBRAINZ_SIMILAR=0|false|off`)
 * or when no contact URL is configured (API User-Agent requirement).
 */
export function isMusicBrainzSimilarDisabled() {
    const v = process.env.MUSICBRAINZ_SIMILAR?.trim()?.toLowerCase() ?? ""
    if (v === "0" || v === "false" || v === "off") return true
    if (!hasMusicBrainzContact()) return true
    return false
}

/** Clamps the similar-track request limit to 1…50 (default 15). */
export function clampMusicBrainzSimilarLimit(limit: unknown): number {
    return Math.min(Math.max(Number(limit) || 15, 1), 50)
}

function musicBrainzUserAgent() {
    const contact =
        process.env.MUSICBRAINZ_CONTACT?.trim() ||
        process.env.MUSICBRAINZ_CONTACT_URL?.trim() ||
        "https://github.com/bpeters132/DimbyBot2"
    return `DimbyBot/0.2.0 ( ${contact} )`
}

/**
 * @param {string} pathQuery path starting with / e.g. /artist?query=...
 */
async function mbFetch(pathQuery: string): Promise<Response> {
    const now = Date.now()
    const wait = Math.max(0, MB_MIN_INTERVAL_MS - (now - lastMbRequestAt))
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastMbRequestAt = Date.now()

    const url = `${MB_ROOT}${pathQuery}`
    const res = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": musicBrainzUserAgent(),
        },
    })
    return res
}

/**
 * Maps a MusicBrainz recording payload to an autoplay `{ artist, title }` seed.
 * Fail-closed on missing/blank titles; falls back to "Unknown Artist" when credits are absent.
 */
export function recordingToSim(rec: unknown): { artist: string; title: string } | null {
    if (!rec || typeof rec !== "object") return null
    const r = rec as {
        title?: unknown
        "artist-credit"?: unknown[]
    }
    const title = typeof r.title === "string" ? r.title.trim() : ""
    if (!title) return null
    const ac = r["artist-credit"]
    if (!Array.isArray(ac) || ac.length === 0) return { artist: "Unknown Artist", title }
    const first = ac[0] as { name?: string; artist?: { name?: string } }
    const name =
        (typeof first?.name === "string" && first.name.trim()) ||
        (typeof first?.artist?.name === "string" && first.artist.name.trim()) ||
        "Unknown Artist"
    return { artist: name, title }
}

/**
 * Collects related-artist MBIDs from a MusicBrainz `artist-rels` payload, skipping the seed
 * and duplicates. Caps at `maxIds` (default 12).
 */
export function relatedArtistMbidsFromRelations(
    relations: unknown,
    seedArtistMbid: string,
    maxIds = 12
): string[] {
    if (!Array.isArray(relations)) return []
    const cap = Math.min(Math.max(Number(maxIds) || 12, 1), 50)
    const ids: string[] = []
    const seen = new Set([seedArtistMbid])
    for (const rel of relations) {
        const other = (rel as { artist?: { id?: string } } | null)?.artist
        const id = typeof other?.id === "string" ? other.id : ""
        if (!id || seen.has(id)) continue
        seen.add(id)
        ids.push(id)
        if (ids.length >= cap) break
    }
    return ids
}

/**
 * @param {string} artistName
 * @returns {Promise<string | null>} artist MBID
 */
async function searchArtistMbid(artistName: string) {
    const q = escapeLucenePhrase(artistName)
    if (!q) return null
    const params = new URLSearchParams({
        query: `artist:"${q}"`,
        fmt: "json",
        limit: "5",
    })
    const res = await mbFetch(`/artist?${params}`)
    if (!res.ok) return null
    const data = (await res.json()) as { artists?: { id?: string }[] }
    const artists = data?.artists
    if (!Array.isArray(artists) || artists.length === 0) return null
    const id = artists[0]?.id
    return typeof id === "string" ? id : null
}

/**
 * @param {string} artistMbid
 * @returns {Promise<string[]>} related artist MBIDs
 */
async function fetchRelatedArtistMbids(artistMbid: string) {
    const params = new URLSearchParams({
        inc: "artist-rels",
        fmt: "json",
    })
    const res = await mbFetch(`/artist/${artistMbid}?${params}`)
    if (!res.ok) return []
    const data = (await res.json()) as { relations?: unknown }
    return relatedArtistMbidsFromRelations(data?.relations, artistMbid, 12)
}

/**
 * @param {string} artistMbid
 * @param {number} limit
 * @returns {Promise<{ artist: string, title: string }[]>}
 */
async function browseRecordingsForArtist(artistMbid: string, limit: number) {
    const params = new URLSearchParams({
        artist: artistMbid,
        fmt: "json",
        limit: String(Math.min(Math.max(limit, 1), 100)),
    })
    const res = await mbFetch(`/recording?${params}`)
    if (!res.ok) return []
    const data = (await res.json()) as { recordings?: unknown[] }
    const recordings = data?.recordings
    if (!Array.isArray(recordings)) return []
    const out: { artist: string; title: string }[] = []
    for (const rec of recordings) {
        const sim = recordingToSim(rec)
        if (sim) out.push(sim)
    }
    return out
}

/**
 * @param {string} artist
 * @param {string} _trackTitle unused for now (could refine search later)
 * @param {number} limit
 * @returns {Promise<{ tracks: { artist: string, title: string }[], failure?: string, failureDetail?: string }>}
 */
export async function getMusicBrainzSimilarTracks(artist: string, _trackTitle: string, limit = 15) {
    const cap = clampMusicBrainzSimilarLimit(limit)
    if (isMusicBrainzSimilarDisabled()) {
        return { tracks: [], failure: "musicbrainz_disabled" }
    }

    const artistName = String(artist || "").trim()
    if (!artistName) return { tracks: [], failure: "musicbrainz_missing_artist" }

    try {
        const seedMbid = await searchArtistMbid(artistName)
        if (!seedMbid) {
            return { tracks: [], failure: "musicbrainz_artist_not_found" }
        }

        const relatedIds = await fetchRelatedArtistMbids(seedMbid)
        const out: { artist: string; title: string }[] = []
        const seen = new Set<string>()

        const keyOf = (s: { artist: string; title: string }) =>
            `${s.artist.toLowerCase().replace(/\s+/g, " ")}::${s.title.toLowerCase().replace(/\s+/g, " ")}`

        for (const rid of relatedIds) {
            if (out.length >= cap) break
            const batch = await browseRecordingsForArtist(rid, 25)
            for (const sim of batch) {
                const k = keyOf(sim)
                if (seen.has(k)) continue
                seen.add(k)
                out.push(sim)
                if (out.length >= cap) break
            }
        }

        if (out.length < cap) {
            const selfBatch = await browseRecordingsForArtist(seedMbid, 40)
            for (const sim of selfBatch) {
                const k = keyOf(sim)
                if (seen.has(k)) continue
                seen.add(k)
                out.push(sim)
                if (out.length >= cap) break
            }
        }

        if (out.length === 0) {
            return { tracks: [], failure: "musicbrainz_no_recordings" }
        }

        return { tracks: out }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { tracks: [], failure: "musicbrainz_error", failureDetail: msg.slice(0, 200) }
    }
}
