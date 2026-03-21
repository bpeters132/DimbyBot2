/**
 * Similar tracks for autoplay using the MusicBrainz Web Service (no Spotify).
 * @see https://musicbrainz.org/doc/MusicBrainz_API — rate limit ~1 req/s; User-Agent required.
 */

const MB_ROOT = "https://musicbrainz.org/ws/2"

let lastMbRequestAt = 0
const MB_MIN_INTERVAL_MS = 1100

function musicBrainzDisabled() {
  const v = process.env.MUSICBRAINZ_SIMILAR?.trim().toLowerCase()
  return v === "0" || v === "false" || v === "off"
}

function musicBrainzUserAgent() {
  const contact =
    process.env.MUSICBRAINZ_CONTACT?.trim() ||
    process.env.MUSICBRAINZ_CONTACT_URL?.trim() ||
    "https://github.com/DimbyBot2/dimbybot2"
  return `DimbyBot/0.2.0 ( ${contact} )`
}

/**
 * @param {string} pathQuery path starting with / e.g. /artist?query=...
 */
async function mbFetch(pathQuery) {
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
 * @param {string} s
 */
function escapeLucenePhrase(s) {
  return String(s || "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
}

/**
 * @param {unknown} rec
 * @returns {{ artist: string, title: string } | null}
 */
function recordingToSim(rec) {
  const title = typeof rec?.title === "string" ? rec.title.trim() : ""
  if (!title) return null
  const ac = rec["artist-credit"]
  if (!Array.isArray(ac) || ac.length === 0) return { artist: "Unknown Artist", title }
  const first = ac[0]
  const name =
    (typeof first?.name === "string" && first.name.trim()) ||
    (typeof first?.artist?.name === "string" && first.artist.name.trim()) ||
    "Unknown Artist"
  return { artist: name, title }
}

/**
 * @param {string} artistName
 * @returns {Promise<string | null>} artist MBID
 */
async function searchArtistMbid(artistName) {
  const q = escapeLucenePhrase(artistName)
  if (!q) return null
  const params = new URLSearchParams({
    query: `artist:"${q}"`,
    fmt: "json",
    limit: "5",
  })
  const res = await mbFetch(`/artist?${params}`)
  if (!res.ok) return null
  const data = await res.json()
  const artists = data?.artists
  if (!Array.isArray(artists) || artists.length === 0) return null
  const id = artists[0]?.id
  return typeof id === "string" ? id : null
}

/**
 * @param {string} artistMbid
 * @returns {Promise<string[]>} related artist MBIDs
 */
async function fetchRelatedArtistMbids(artistMbid) {
  const params = new URLSearchParams({
    inc: "artist-rels",
    fmt: "json",
  })
  const res = await mbFetch(`/artist/${artistMbid}?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  const relations = data?.relations
  if (!Array.isArray(relations)) return []
  /** @type {string[]} */
  const ids = []
  const seen = new Set([artistMbid])
  for (const rel of relations) {
    const other = rel?.artist
    const id = typeof other?.id === "string" ? other.id : ""
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
    if (ids.length >= 12) break
  }
  return ids
}

/**
 * @param {string} artistMbid
 * @param {number} limit
 * @returns {Promise<{ artist: string, title: string }[]>}
 */
async function browseRecordingsForArtist(artistMbid, limit) {
  const params = new URLSearchParams({
    artist: artistMbid,
    fmt: "json",
    limit: String(Math.min(Math.max(limit, 1), 100)),
  })
  const res = await mbFetch(`/recording?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  const recordings = data?.recordings
  if (!Array.isArray(recordings)) return []
  /** @type {{ artist: string, title: string }[]} */
  const out = []
  for (const rec of recordings) {
    const sim = recordingToSim(rec)
    if (sim) out.push(sim)
  }
  return out
}

/**
 * @param {string} artist
 * @param {string} trackTitle unused for now (could refine search later)
 * @param {number} limit
 * @returns {Promise<{ tracks: { artist: string, title: string }[], failure?: string, failureDetail?: string }>}
 */
export async function getMusicBrainzSimilarTracks(artist, trackTitle, limit = 15) {
  const cap = Math.min(Math.max(Number(limit) || 15, 1), 50)
  if (musicBrainzDisabled()) {
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
    /** @type {{ artist: string, title: string }[]} */
    const out = []
    const seen = new Set()

    const keyOf = (s) =>
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
