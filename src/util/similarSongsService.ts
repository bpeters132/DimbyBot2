import { coreTrackTitle } from "./autoplayHistory.js"
import { getMusicBrainzSimilarTracks } from "./musicBrainzSimilarService.js"

type SpotifyTokenCache = { token: string; expiresAt: number } | null

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
const SPOTIFY_API = "https://api.spotify.com/v1"

let spotifyTokenCache: SpotifyTokenCache = null

/**
 * ISO 3166-1 alpha-2. Required for top-tracks and search with client credentials.
 */
function getSpotifyMarket() {
    const raw =
        process.env.SPOTIFY_MARKET?.trim() ||
        process.env.LAVALINK_SPOTIFY_COUNTRY_CODE?.trim() ||
        "US"
    const up = raw.toUpperCase()
    return /^[A-Z]{2}$/.test(up) ? up : "US"
}

type TrackSeedContextOk = {
    ok: true
    artistIds: string[]
    primaryArtistName: string
}

type TrackSeedContextErr = {
    ok: false
    artistIds: []
    primaryArtistName: ""
    httpStatus?: number
    errorSnippet?: string
}

/** Loads seed track artists from Spotify; surfaces HTTP/network failures like the other Spotify helpers. */
async function fetchTrackSeedContext(
    accessToken: string,
    trackId: string,
    market: string
): Promise<TrackSeedContextOk | TrackSeedContextErr> {
    try {
        const q = new URLSearchParams({ market })
        const res = await fetch(`${SPOTIFY_API}/tracks/${trackId}?${q}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) {
            const text = await res.text().catch(() => "")
            return {
                ok: false,
                artistIds: [],
                primaryArtistName: "",
                httpStatus: res.status,
                errorSnippet: text.replace(/\s+/g, " ").trim().slice(0, 280),
            }
        }
        const data = (await res.json()) as { artists?: { id?: string; name?: string }[] }
        const artists = data?.artists
        if (!Array.isArray(artists)) {
            return { ok: true, artistIds: [], primaryArtistName: "" }
        }
        const artistIds = artists
            .map((a) => a?.id)
            .filter((id): id is string => typeof id === "string")
        const n = artists[0]?.name
        const primaryArtistName = typeof n === "string" ? n.trim() : ""
        return { ok: true, artistIds, primaryArtistName }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return {
            ok: false,
            artistIds: [],
            primaryArtistName: "",
            httpStatus: undefined,
            errorSnippet: msg,
        }
    }
}

function isValidArtist(a: unknown): a is { id: string; name?: string } {
    if (!a || typeof a !== "object") return false
    const id = (a as { id?: unknown }).id
    return typeof id === "string" && id.length > 0
}

async function fetchRelatedArtists(accessToken: string, artistId: string) {
    try {
        const res = await fetch(`${SPOTIFY_API}/artists/${artistId}/related-artists`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (res.status === 429) {
            return { ok: false, artists: [], httpStatus: 429, errorSnippet: "rate_limited" }
        }
        if (!res.ok) {
            const text = await res.text().catch(() => "")
            return {
                ok: false,
                artists: [],
                httpStatus: res.status,
                errorSnippet: text.replace(/\s+/g, " ").trim().slice(0, 280),
            }
        }
        const data = (await res.json()) as { artists?: unknown[] }
        const list = data?.artists
        if (!Array.isArray(list)) return { ok: true, artists: [] }
        const artists = list.filter(isValidArtist).map((a) => ({
            id: a.id,
            name: typeof a.name === "string" ? a.name : undefined,
        }))
        return { ok: true, artists }
    } catch {
        return { ok: false, artists: [], httpStatus: 0, errorSnippet: "network_error" }
    }
}

async function fetchArtistTopTracks(accessToken: string, artistId: string, market: string) {
    try {
        const params = new URLSearchParams({ market })
        const res = await fetch(`${SPOTIFY_API}/artists/${artistId}/top-tracks?${params}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (res.status === 429) {
            return { ok: false, tracks: [], httpStatus: 429, errorSnippet: "rate_limited" }
        }
        if (!res.ok) {
            const text = await res.text().catch(() => "")
            return {
                ok: false,
                tracks: [],
                httpStatus: res.status,
                errorSnippet: text.replace(/\s+/g, " ").trim().slice(0, 280),
            }
        }
        const data = (await res.json()) as { tracks?: unknown[] }
        const tracks = data?.tracks
        return { ok: true, tracks: Array.isArray(tracks) ? tracks : [] }
    } catch {
        return { ok: false, tracks: [], httpStatus: 0, errorSnippet: "network_error" }
    }
}

/** Catalog search when related-artists is unavailable (often 404 for client-credentials). */
async function searchTopTracksByArtistName(
    accessToken: string,
    artistName: string,
    market: string
) {
    const safe = String(artistName || "")
        .trim()
        .replace(/"/g, "")
    if (!safe) return { ok: true, tracks: [] }
    try {
        const q = `artist:"${safe}"`
        const params = new URLSearchParams({ q, type: "track", market, limit: "50" })
        const res = await fetch(`${SPOTIFY_API}/search?${params}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (res.status === 429) {
            return { ok: false, tracks: [], httpStatus: 429, errorSnippet: "rate_limited" }
        }
        if (!res.ok) {
            const text = await res.text().catch(() => "")
            return {
                ok: false,
                tracks: [],
                httpStatus: res.status,
                errorSnippet: text.replace(/\s+/g, " ").trim().slice(0, 280),
            }
        }
        const data = (await res.json()) as { tracks?: { items?: unknown[] } }
        const items = data?.tracks?.items
        return { ok: true, tracks: Array.isArray(items) ? items : [] }
    } catch {
        return { ok: false, tracks: [], httpStatus: 0, errorSnippet: "network_error" }
    }
}

function spotifyTrackToSim(t: unknown, excludeTrackIds: Set<string>) {
    if (!t || typeof t !== "object") return null
    const tr = t as { id?: unknown; name?: unknown; artists?: { name?: unknown }[] }
    const id = typeof tr.id === "string" ? tr.id : ""
    if (!id || excludeTrackIds.has(id)) return null
    const name = typeof tr.name === "string" ? tr.name.trim() : ""
    const artName = tr.artists?.[0]?.name
    const art = typeof artName === "string" ? artName.trim() : ""
    if (!name) return null
    return { artist: art || "Unknown Artist", title: name }
}

/** Similar tracks via Related Artists + Top Tracks (no deprecated /recommendations). */
async function spotifySimilarTracksFromRelatedAndTop(
    accessToken: string,
    seedTrackId: string,
    market: string,
    limit: number,
    artistNameHint = ""
) {
    const cap = Math.min(Math.max(Number(limit) || 15, 1), 100)
    const excludeIds = new Set([seedTrackId])
    const out: { artist: string; title: string }[] = []
    let lastStatus: number | undefined
    let lastSnippet: string | undefined

    const pushFromTracks = (tracks: unknown): boolean => {
        if (!Array.isArray(tracks)) return false
        for (const t of tracks) {
            const sim = spotifyTrackToSim(t, excludeIds)
            if (!sim) continue
            const tr = t as { id?: unknown }
            const tid = typeof tr?.id === "string" ? tr.id : ""
            if (tid) excludeIds.add(tid)
            out.push(sim)
            if (out.length >= cap) return true
        }
        return false
    }

    const seedCtx = await fetchTrackSeedContext(accessToken, seedTrackId, market)
    const hintLabel = String(artistNameHint || "").trim()

    if (!seedCtx.ok) {
        if (seedCtx.httpStatus === 429) {
            return {
                tracks: [],
                apiFailed: true,
                rateLimited: true,
                httpStatus: 429,
                errorSnippet: seedCtx.errorSnippet,
            }
        }
        if (hintLabel) {
            const searched = await searchTopTracksByArtistName(accessToken, hintLabel, market)
            if (searched.ok) {
                pushFromTracks(searched.tracks)
            } else if (searched.httpStatus === 429) {
                return {
                    tracks: out,
                    apiFailed: out.length === 0,
                    rateLimited: true,
                    httpStatus: 429,
                    errorSnippet: searched.errorSnippet,
                }
            }
            if (out.length > 0) {
                return { tracks: out, apiFailed: false, rateLimited: false }
            }
        }
        return {
            tracks: [],
            apiFailed: true,
            rateLimited: false,
            httpStatus: seedCtx.httpStatus ?? 0,
            errorSnippet: seedCtx.errorSnippet,
        }
    }

    const { artistIds, primaryArtistName } = seedCtx
    const primaryArtistId = artistIds[0]
    const artistLabel = primaryArtistName || hintLabel

    if (!primaryArtistId) {
        if (artistLabel) {
            const searched = await searchTopTracksByArtistName(accessToken, artistLabel, market)
            if (searched.ok) {
                pushFromTracks(searched.tracks)
            } else if (searched.httpStatus === 429) {
                return {
                    tracks: out,
                    apiFailed: out.length === 0,
                    rateLimited: true,
                    httpStatus: 429,
                    errorSnippet: searched.errorSnippet,
                }
            }
        }
        if (out.length > 0) {
            return { tracks: out, apiFailed: false, rateLimited: false }
        }
        return {
            tracks: [],
            apiFailed: true,
            rateLimited: false,
            httpStatus: 404,
            errorSnippet: "no_primary_artist_on_seed_track",
        }
    }

    /** Spotify often returns 404 for GET /artists/{id}/related-artists (removed / restricted) — fall back. */
    let relatedArtists: { id: string; name?: string }[] = []
    const related = await fetchRelatedArtists(accessToken, primaryArtistId)
    if (related.ok) {
        relatedArtists = related.artists
    } else if (related.httpStatus === 429) {
        return {
            tracks: [],
            apiFailed: true,
            rateLimited: true,
            httpStatus: 429,
            errorSnippet: related.errorSnippet,
        }
    } else if (related.httpStatus === 401 || related.httpStatus === 403) {
        return {
            tracks: [],
            apiFailed: true,
            rateLimited: false,
            httpStatus: related.httpStatus,
            errorSnippet: related.errorSnippet,
        }
    }

    const relatedSlice = relatedArtists.slice(0, 12)
    for (const a of relatedSlice) {
        const batch = await fetchArtistTopTracks(accessToken, a.id, market)
        if (!batch.ok) {
            lastStatus = batch.httpStatus
            lastSnippet = batch.errorSnippet
            if (batch.httpStatus === 429) {
                return {
                    tracks: out,
                    apiFailed: out.length === 0,
                    rateLimited: true,
                    httpStatus: 429,
                    errorSnippet: batch.errorSnippet,
                }
            }
            continue
        }
        if (pushFromTracks(batch.tracks)) {
            return { tracks: out, apiFailed: false, rateLimited: false }
        }
    }

    if (out.length > 0) {
        return { tracks: out, apiFailed: false, rateLimited: false }
    }

    const selfTop = await fetchArtistTopTracks(accessToken, primaryArtistId, market)
    if (selfTop.ok) {
        pushFromTracks(selfTop.tracks)
    } else if (selfTop.httpStatus === 429) {
        return {
            tracks: out,
            apiFailed: out.length === 0,
            rateLimited: true,
            httpStatus: 429,
            errorSnippet: selfTop.errorSnippet,
        }
    } else {
        lastStatus = selfTop.httpStatus
        lastSnippet = selfTop.errorSnippet
    }

    if (out.length < cap && artistLabel) {
        const searched = await searchTopTracksByArtistName(accessToken, artistLabel, market)
        if (searched.ok) {
            pushFromTracks(searched.tracks)
        } else if (searched.httpStatus === 429) {
            return {
                tracks: out,
                apiFailed: out.length === 0,
                rateLimited: true,
                httpStatus: 429,
                errorSnippet: searched.errorSnippet,
            }
        } else if (out.length === 0) {
            return {
                tracks: [],
                apiFailed: true,
                rateLimited: false,
                httpStatus: searched.httpStatus,
                errorSnippet: searched.errorSnippet,
            }
        }
    }

    if (out.length === 0) {
        return {
            tracks: [],
            apiFailed: false,
            rateLimited: false,
            httpStatus: lastStatus,
            errorSnippet: lastSnippet,
        }
    }

    return { tracks: out, apiFailed: false, rateLimited: false }
}

/** Lavalink-friendly search query from artist + title fields. */
export function formatTrackSearchQuery(track: { artist?: string; title?: string }) {
    const artist = String(track?.artist ?? "").trim()
    const title = String(track?.title ?? "").trim()
    if (artist && title) return `${artist} - ${title}`
    if (title) return title
    if (artist) return artist
    return ""
}

function getSpotifyAppCredentials() {
    const id =
        process.env.SPOTIFY_CLIENT_ID?.trim() || process.env.LAVALINK_SPOTIFY_CLIENT_ID?.trim()
    const secret =
        process.env.SPOTIFY_CLIENT_SECRET?.trim() ||
        process.env.LAVALINK_SPOTIFY_CLIENT_SECRET?.trim()
    if (id && secret) return { id, secret }
    return null
}

async function getSpotifyAccessToken() {
    const creds = getSpotifyAppCredentials()
    if (!creds) return null

    const now = Date.now()
    if (spotifyTokenCache && spotifyTokenCache.expiresAt > now + 5000) {
        return spotifyTokenCache.token
    }

    try {
        const body = new URLSearchParams({ grant_type: "client_credentials" })
        const basic = Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")
        const res = await fetch(SPOTIFY_TOKEN_URL, {
            method: "POST",
            headers: {
                Authorization: `Basic ${basic}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        })
        if (!res.ok) return null
        const data = (await res.json()) as { access_token?: string; expires_in?: number }
        if (!data.access_token || !data.expires_in) return null
        spotifyTokenCache = {
            token: data.access_token,
            expiresAt: now + data.expires_in * 1000,
        }
        return spotifyTokenCache.token
    } catch {
        return null
    }
}

async function spotifySearchTrackId(
    accessToken: string,
    artist: string,
    trackName: string,
    market: string
) {
    const raw = String(trackName).replace(/"/g, "").trim()
    const simplified = coreTrackTitle(raw) || raw
    const art = String(artist).replace(/"/g, "").trim()
    const attempts: string[] = [`track:"${simplified}" artist:"${art}"`, `${art} ${simplified}`]
    if (raw !== simplified) {
        attempts.push(`track:"${raw}" artist:"${art}"`, `${art} ${raw}`)
    }
    for (const q of attempts) {
        const params = new URLSearchParams({ q, type: "track", limit: "1", market })
        try {
            const res = await fetch(`${SPOTIFY_API}/search?${params}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (!res.ok) continue
            const data = (await res.json()) as { tracks?: { items?: { id?: string }[] } }
            const id = data?.tracks?.items?.[0]?.id
            if (typeof id === "string") return id
        } catch {
            /* try next */
        }
    }
    return null
}

/**
 * YouTube search strings for a Spotify-style catalog track (artist + title).
 * Ordered so Lavalink is more likely to resolve to the real recording, not clips.
 */
export function youtubeSearchQueriesForCatalogTrack(track: { artist?: string; title?: string }) {
    const q = formatTrackSearchQuery(track)
    if (!q) return []
    return [
        `ytsearch:${q} official audio`,
        `ytsearch:${q} official music video`,
        `ytsearch:${q} audio`,
        `ytsearch:${q}`,
    ]
}

/**
 * Similar tracks for autoplay: Spotify catalog first (related/top/search), then MusicBrainz
 * (artist-rels + browse recordings). See https://musicbrainz.org/doc/MusicBrainz_API
 * Uses SPOTIFY_* / LAVALINK_SPOTIFY_* when present; MB needs no key (User-Agent + ~1 req/s).
 */
export type SimilarTracksResult = {
    tracks: { artist: string; title: string }[]
    failure?: string
    failureDetail?: string
}

export async function getSimilarTracks(
    artist: string,
    trackName: string,
    limit = 15
): Promise<SimilarTracksResult> {
    const empty = (failure: string, detail?: string): SimilarTracksResult => {
        const o: SimilarTracksResult = { tracks: [], failure }
        if (detail) o.failureDetail = detail
        return o
    }
    const maxSimilar = 100
    const defaultLimit = 15
    const nLimit = Number.isFinite(Number(limit))
        ? Math.max(1, Math.min(maxSimilar, Math.floor(Number(limit))))
        : defaultLimit

    const a = String(artist).trim()
    const t = String(trackName).trim()
    if (!a || !t) return empty("missing_artist_or_title")

    const spotifyNotes: string[] = []

    if (getSpotifyAppCredentials()) {
        const token = await getSpotifyAccessToken()
        if (!token) {
            spotifyNotes.push("spotify_token_failed")
        } else {
            const market = getSpotifyMarket()
            const trackId = await spotifySearchTrackId(token, a, t, market)
            if (!trackId) {
                spotifyNotes.push("spotify_track_lookup_failed")
            } else {
                const { tracks, apiFailed, rateLimited, httpStatus, errorSnippet } =
                    await spotifySimilarTracksFromRelatedAndTop(token, trackId, market, nLimit, a)

                if (rateLimited) spotifyNotes.push("spotify_rate_limited")
                if (tracks.length > 0) return { tracks }
                if (apiFailed) {
                    spotifyNotes.push(
                        [httpStatus, errorSnippet].filter(Boolean).join(" ").trim() ||
                            "spotify_catalog_http_error"
                    )
                } else {
                    spotifyNotes.push("spotify_no_similar_catalog")
                }
            }
        }
    } else {
        spotifyNotes.push("no_spotify_credentials")
    }

    const mb = await getMusicBrainzSimilarTracks(a, t, nLimit)
    if (mb.tracks.length > 0) return { tracks: mb.tracks }

    const detail = [...spotifyNotes, mb.failure, mb.failureDetail].filter(Boolean).join(" | ")
    return empty("no_similar_catalog", detail || undefined)
}
