/** How many distinct recent songs to remember per player (session-only). */
export const AUTOPLAY_RECENT_SONG_CAP = 20

/** @deprecated use AUTOPLAY_RECENT_SONG_CAP */
export const AUTOPLAY_RECENT_CAP = AUTOPLAY_RECENT_SONG_CAP

const RECENT_SONGS_KEY = "autoplayRecentSongs"

/** Strip common YouTube / promo suffixes (after bracket removal in normalize). */
const TITLE_TRAILER_RE =
  /\b(official\s*)?(music\s*)?video\b|\bofficial\s*audio\b|\b(audio\s*)?only\b|\blyrics?\s*(video)?\b|\bvisuali[sz]er\b|\b(full\s*)?album\b|\bremaster(ed)?\s*\(?\d*\)?\b|\bmv\b|\bhd\b|\b4k\b|\bupgrad(e|ed)\b|\bexplicit\s*version\b|\bclean\s*version\b|\bperformance\b|\bacoustic\b|\blive\s+at\b|\blive\s+from\b|\bfrom\s+the\s+album\b|\btheme\s+from\b|\bsoundtrack\b|\bost\b|\bcover\b|\bversion\b/gi

/**
 * @param {string | undefined} uri
 * @returns {string | null}
 */
export function youtubeVideoIdFromUri(uri) {
  if (!uri || typeof uri !== "string") return null
  try {
    const u = new URL(uri)
    const host = u.hostname
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0]
      return id || null
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = u.searchParams.get("v")
      if (v) return v
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)
      if (m) return m[1]
    }
    return null
  } catch {
    return null
  }
}

/**
 * @param {string | undefined} s
 * @returns {string}
 */
export function normalizeAutoplayComparable(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Title with promo noise removed — closer to the “real” song name for fuzzy match.
 * @param {string | undefined} title
 * @returns {string}
 */
export function coreTrackTitle(title) {
  let s = normalizeAutoplayComparable(title)
  s = s.replace(TITLE_TRAILER_RE, " ")
  s = s.replace(/\s+/g, " ").trim()
  return s
}

/**
 * Primary name for comparison (strips "feat." tail on channel/title-style strings).
 * @param {string | undefined} s
 * @returns {string}
 */
export function primaryArtistKey(s) {
  let x = normalizeAutoplayComparable(s)
  x = x.replace(/\s+(feat\.?|ft\.?|featuring)\s+.+$/i, "").trim()
  return x
}

/**
 * Song title for identity when Lavalink puts "Artist - Song" in the title field (YouTube).
 * @param {string | undefined} author
 * @param {string | undefined} title
 * @returns {string}
 */
export function canonicalSongCore(author, title) {
  const a = primaryArtistKey(author)
  let c = coreTrackTitle(title)
  if (!c) return ""

  if (a) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`^${esc}\\s*[-–—:|]\\s*(.+)$`)
    const m = c.match(re)
    if (m) {
      const rest = coreTrackTitle(m[1])
      if (rest.length >= 1) c = rest
    }
  }

  return c.trim()
}

/**
 * @param {string | undefined} seedArtist
 * @param {string | undefined} candidateArtist
 * @returns {boolean}
 */
export function isSamePrimaryArtist(seedArtist, candidateArtist) {
  const x = primaryArtistKey(seedArtist)
  const y = primaryArtistKey(candidateArtist)
  if (!x || !y) return false
  return x === y
}

/** Talk shows, reactions, news-style uploads — not what we want after Spotify picks a real track. */
const AUTOPLAY_JUNK_BLOB_RES = [
  /\bvoice\s+teacher\b|\bvocal\s+coach\b|\bmusic\s+teacher\b|\bsinging\s+teacher\b/i,
  /\bproducer\s+reacts?\b|\bartist\s+reacts?\b|\breactors?\b/i,
  /\breacts?\s+to\b|\breaction\s+to\b|\blive\s+reaction\b|\breaction\s+video\b/i,
  /\bfirst\s+time\s+(hearing|listening)\b/i,
  /\bconan\b|\bconan\s+o[']?brien\b|\bon\s+tbs\b|\btbs\b/i,
  /\bjimmy\s+fallon\b|\bjimmy\s+kimmel\b|\bstephen\s+colbert\b|\bseth\s+meyers\b|\bellen\s+degeneres\b/i,
  /\bhealth\s+issue\b|\bbackstage\b.*\b(story|drama)\b|\bduring\s+the\s+\w+\s+performance\b/i,
  /\bexclusive\s+interview\b|\bextended\s+interview\b|\bfull\s+interview\b|\bpodcast\s+clip\b|\bfull\s+podcast\b/i,
  /\bhighlights?\s+reel\b|\bbest\s+moments\b|\btiktok\s+compilation\b/i,
  /\bwatchmojo\b/i,
  /#\s*shorts\b|\byoutube\s+shorts\b/i,
  /\bvietsub\b|\bsub\s*thai\b|\bsub\s*indo\b|\bmv\s*fanmade\b/i,
  /#\s*fyp\b|#\s*idolyrics\b|#\s*mitoskareen/i,
]

/**
 * True if a Lavalink result is plausibly the song recording, not a clip or reaction upload.
 * @param {import("lavalink-client").TrackInfo | undefined} info
 * @returns {boolean}
 */
export function isPlausibleAutoplayMusicTrack(info) {
  if (!info?.title) return false
  const blob = normalizeAutoplayComparable(`${info.author || ""} ${info.title}`)
  if (!blob) return false
  for (const re of AUTOPLAY_JUNK_BLOB_RES) {
    if (re.test(blob)) return false
  }
  const dur = info.duration
  if (typeof dur === "number" && dur > 0 && !info.isStream && dur < 22000) return false
  return true
}

/**
 * @param {string | undefined} a
 * @returns {boolean}
 */
function isWeakArtistKey(a) {
  const x = primaryArtistKey(a)
  return !x || x === "unknown artist" || x === "unknown"
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const row = new Array(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const cur = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = cur
    }
  }
  return row[n]
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function tokenJaccard(a, b) {
  const ta = new Set(a.split(" ").filter((w) => w.length > 2))
  const tb = new Set(b.split(" ").filter((w) => w.length > 2))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * Compare two already-normalized core title strings.
 * @param {string} ca
 * @param {string} cb
 * @returns {boolean}
 */
function coresLikelySame(ca, cb) {
  if (!ca || !cb) return false
  if (ca === cb) return true

  const shorter = ca.length <= cb.length ? ca : cb
  const longer = ca.length > cb.length ? ca : cb
  if (shorter.length >= 6 && longer.includes(shorter)) return true

  const j = tokenJaccard(ca, cb)
  if (j >= 0.82) return true

  const cap = 96
  const sa = ca.length > cap ? ca.slice(0, cap) : ca
  const sb = cb.length > cap ? cb.slice(0, cap) : cb
  const maxLen = Math.max(sa.length, sb.length)
  if (maxLen < 5) return false
  const dist = levenshtein(sa, sb)
  return dist / maxLen <= 0.14
}

/** Latin letters only (drops Arabic/CJK etc.) so "Favourite Lyrics مترجمة…" still pairs with "Favorite". */
function latinWordBlob(s) {
  return normalizeAutoplayComparable(s)
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const COMPOSITION_HEAD_STOP = new Set([
  "lyrics",
  "lyric",
  "video",
  "audio",
  "official",
  "mv",
  "hd",
  "4k",
  "remix",
  "edit",
  "version",
  "visualizer",
  "karaoke",
  "sub",
  "subs",
  "subtitle",
  "subtitles",
  "espanol",
  "portugues",
  "nightcore",
  "slowed",
  "reverb",
  "bass",
  "boosted",
  "extended",
  "live",
  "vietsub",
  "older",
])

/**
 * First few Latin words of a title core (stops at promo / lyric noise — not "filter all",
 * so text after "lyrics" does not widen the head).
 * @param {string} core
 * @returns {string}
 */
function latinTitleHead(core) {
  const words = latinWordBlob(core).split(" ").filter((w) => w.length > 1)
  const out = []
  for (const w of words) {
    if (COMPOSITION_HEAD_STOP.has(w)) break
    out.push(w)
    if (out.length >= 4) break
  }
  return out.join(" ")
}

/**
 * Same track identity for dedupe: full core match, or same primary artist + matching Latin title head
 * (US/UK spelling, lyric/translation uploads).
 * @param {string} ca
 * @param {string} cb
 * @param {string | undefined} authorA
 * @param {string | undefined} authorB primary key from history or raw author
 * @param {{ strictShortCrossArtist?: boolean }} [opts]
 * @returns {boolean}
 */
function compositionMatchFromCores(ca, cb, authorA, authorB, opts = {}) {
  const { strictShortCrossArtist = false } = opts
  if (!ca || !cb) return false
  const maxLen = Math.max(ca.length, cb.length)

  if (maxLen >= 8) {
    if (coresLikelySame(ca, cb)) return true
    const artistBKnown = authorB && authorB !== "_"
    if (artistBKnown && isSamePrimaryArtist(authorA, authorB)) {
      const ha = latinTitleHead(ca)
      const hb = latinTitleHead(cb)
      if (ha.length >= 4 && hb.length >= 4 && coresLikelySame(ha, hb)) return true
    }
    return false
  }

  // Short cores: exact string match alone would merge unrelated songs (e.g. "Run", "Up"); require same primary artist.
  if (ca === cb) {
    const artistBKnown = authorB && authorB !== "_"
    if (!artistBKnown) return false
    return isSamePrimaryArtist(authorA, authorB)
  }
  if (strictShortCrossArtist) {
    return !!(
      authorB &&
      authorB !== "_" &&
      isSamePrimaryArtist(authorA, authorB) &&
      coresLikelySame(ca, cb)
    )
  }
  if (authorB && authorB !== "_" && isSamePrimaryArtist(authorA, authorB) && coresLikelySame(ca, cb)) {
    return true
  }
  return false
}

/**
 * Whether two display titles likely refer to the same musical work (not exact string match).
 * @param {string | undefined} titleA
 * @param {string | undefined} titleB
 * @param {string | undefined} authorA
 * @param {string | undefined} authorB
 * @returns {boolean}
 */
export function titlesLikelySameSong(titleA, titleB, authorA, authorB) {
  const ca = canonicalSongCore(authorA, titleA)
  const cb = canonicalSongCore(authorB, titleB)
  if (!coresLikelySame(ca, cb)) return false

  const pa = primaryArtistKey(authorA)
  const pb = primaryArtistKey(authorB)
  const j = tokenJaccard(ca, cb)
  const maxLen = Math.max(ca.length, cb.length)
  if (pa && pb && pa === pb && j >= 0.65 && maxLen >= 10) return true

  if (artistsCompatibleForSameSong(authorA, authorB)) return true
  if (isWeakArtistKey(authorA) && isWeakArtistKey(authorB) && j >= 0.88) return true

  return false
}

/**
 * True if a Lavalink search hit corresponds to the catalog row we queried (not an unrelated top result).
 * Compares the hit to the catalog artist/title; when the catalog row is the same work as the track that
 * ended (common for the autoplay seed), {@link endedInfo} is used as an alternate spelling for matching.
 * @param {import("lavalink-client").TrackInfo | import("lavalink-client").UnresolvedTrackInfo | undefined} info
 * @param {string} catalogArtist
 * @param {string} catalogTitle
 * @param {string} seedArtist
 * @param {import("lavalink-client").TrackInfo | undefined} endedInfo
 * @returns {boolean}
 */
export function matchesCatalogCandidate(info, catalogArtist, catalogTitle, seedArtist, endedInfo) {
  void seedArtist
  if (!info) return false
  const ca = String(catalogArtist || "").trim()
  const ct = String(catalogTitle || "").trim()
  if (!ca || !ct) return false

  if (autoplaySameComposition(ca, ct, info.author, info.title)) return true
  if (isSamePrimaryArtist(ca, info.author) && titlesLikelySameSong(ct, info.title, ca, info.author)) return true

  const ea = endedInfo?.author?.trim()
  const et = endedInfo?.title?.trim()
  if (ea && et && autoplaySameComposition(ca, ct, ea, et)) {
    if (autoplaySameComposition(ea, et, info.author, info.title)) return true
    if (isSamePrimaryArtist(ea, info.author) && titlesLikelySameSong(et, info.title, ea, info.author)) return true
  }

  return false
}

/**
 * Same musical work as the seed (covers, remixes, lyric uploads), for filtering recommendations / autoplay.
 * @param {string | undefined} seedArtist
 * @param {string | undefined} seedTitle
 * @param {string | undefined} candArtist
 * @param {string | undefined} candTitle
 * @returns {boolean}
 */
export function autoplaySameComposition(
  seedArtist,
  seedTitle,
  candArtist,
  candTitle
) {
  const a = canonicalSongCore(seedArtist, seedTitle)
  const b = canonicalSongCore(candArtist, candTitle)
  if (!a || !b) return false
  return compositionMatchFromCores(a, b, seedArtist, candArtist, { strictShortCrossArtist: true })
}

/**
 * @param {string | undefined} authorA
 * @param {string | undefined} authorB
 * @returns {boolean}
 */
function artistsCompatibleForSameSong(authorA, authorB) {
  if (isSamePrimaryArtist(authorA, authorB)) return true
  if (isWeakArtistKey(authorA) || isWeakArtistKey(authorB)) return false
  const pa = primaryArtistKey(authorA)
  const pb = primaryArtistKey(authorB)
  if (pa.length >= 4 && pb.length >= 4 && (pa.includes(pb) || pb.includes(pa))) return true
  return false
}

/**
 * @param {string | undefined} author
 * @param {string | undefined} title
 * @returns {string}
 */
export function songIdentityKey(author, title) {
  const a = primaryArtistKey(author)
  const c = canonicalSongCore(author, title)
  if (c.length < 2) return ""
  const ak = a && !isWeakArtistKey(author) ? a : "_"
  return `sg:${ak}|${c}`
}

/**
 * One line per distinct song for the recent list: `artistKey::canonicalCore`
 * @param {import("lavalink-client").TrackInfo | import("lavalink-client").UnresolvedTrackInfo | undefined} info
 * @returns {string | null}
 */
function recentSongLine(info) {
  if (!info) return null
  const a = primaryArtistKey(info.author)
  const c = canonicalSongCore(info.author, info.title)
  if (!c) return null
  return `${a || "_"}::${c}`
}

/**
 * Stable id for history / dedupe (YouTube id preferred).
 * @param {import("lavalink-client").TrackInfo | import("lavalink-client").UnresolvedTrackInfo | undefined} info
 * @returns {string}
 */
export function autoplayTrackFingerprint(info) {
  if (!info) return ""
  const yid = youtubeVideoIdFromUri(info.uri)
  if (yid) return `yt:${yid}`
  if (info.identifier) return `id:${String(info.identifier).trim()}`
  const sg = songIdentityKey(info.author, info.title)
  if (sg) return sg
  return `t:${primaryArtistKey(info.author)}|${normalizeAutoplayComparable(info.title)}`
}

/**
 * @param {import("lavalink-client").Player} player
 * @returns {string[]}
 */
function getRecentSongLines(player) {
  const raw = player.get(RECENT_SONGS_KEY)
  return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : []
}

/**
 * Remember one played song (counts as one slot toward {@link AUTOPLAY_RECENT_SONG_CAP}).
 * @param {import("lavalink-client").Player} player
 * @param {import("lavalink-client").TrackInfo | import("lavalink-client").UnresolvedTrackInfo | undefined} info
 */
export function rememberAutoplayPlayed(player, info) {
  const line = recentSongLine(info)
  if (!line) return
  let songs = getRecentSongLines(player)
  songs = songs.filter((x) => x !== line)
  songs.unshift(line)
  if (songs.length > AUTOPLAY_RECENT_SONG_CAP) songs = songs.slice(0, AUTOPLAY_RECENT_SONG_CAP)
  player.set(RECENT_SONGS_KEY, songs)
}

/**
 * @param {import("lavalink-client").Player} player
 * @param {import("lavalink-client").TrackInfo | import("lavalink-client").UnresolvedTrackInfo | undefined} info
 * @returns {boolean}
 */
export function isAutoplayRecentlyPlayed(player, info) {
  if (!info) return false
  const songs = getRecentSongLines(player)
  if (songs.length === 0) return false

  const candLine = recentSongLine(info)
  if (candLine && songs.includes(candLine)) return true

  const candCore = canonicalSongCore(info.author, info.title)
  if (!candCore) return false

  for (const line of songs) {
    const sep = line.indexOf("::")
    if (sep < 0) continue
    const stArt = line.slice(0, sep)
    const stCore = line.slice(sep + 2)
    if (!stCore) continue

    if (compositionMatchFromCores(candCore, stCore, info.author, stArt)) return true
  }

  return false
}

/**
 * Clears session autoplay “recently played” state.
 * Also clears legacy key "autoplayRecent" (older single-string format) so mixed-version deploys do not leave stale data.
 * TODO: remove the autoplayRecent line after 2026-09-01 if no production players still carry that key.
 * @param {import("lavalink-client").Player} player
 */
export function clearAutoplayRecent(player) {
  player.set(RECENT_SONGS_KEY, [])
  player.set("autoplayRecent", [])
}

/**
 * Backfill history when autoplay is turned on mid-session (e.g. after /play) so the
 * current track and recent queue.previous entries count as "already played".
 * @param {import("lavalink-client").Player} player
 */
export function seedAutoplayHistoryFromPlayer(player) {
  const prev = player.queue?.previous ?? []
  for (let i = prev.length - 1; i >= 0; i--) {
    const tr = prev[i]
    if (tr?.info) rememberAutoplayPlayed(player, tr.info)
  }
  const cur = player.queue?.current
  if (cur?.info) rememberAutoplayPlayed(player, cur.info)
}

/**
 * True if the candidate is the same source as the track that just ended.
 * @param {import("lavalink-client").TrackInfo | import("lavalink-client").UnresolvedTrackInfo | undefined} cand
 * @param {import("lavalink-client").TrackInfo | undefined} ended
 * @returns {boolean}
 */
export function isDuplicateAutoplayCandidate(cand, ended) {
  if (!cand || !ended) return false

  if (cand.uri && ended.uri && cand.uri === ended.uri) return true

  const idC = cand.identifier?.trim()
  const idE = ended.identifier?.trim()
  if (idC && idE && idC === idE) return true

  const yC = youtubeVideoIdFromUri(cand.uri)
  const yE = youtubeVideoIdFromUri(ended.uri)
  if (yC && yE && yC === yE) return true

  const tc = normalizeAutoplayComparable(cand.title)
  const te = normalizeAutoplayComparable(ended.title)
  if (
    tc.length >= 4 &&
    te.length >= 4 &&
    tc === te &&
    artistsCompatibleForSameSong(cand.author, ended.author)
  ) {
    return true
  }

  const fullC = normalizeAutoplayComparable(`${cand.author || ""} ${cand.title}`)
  const fullE = normalizeAutoplayComparable(`${ended.author || ""} ${ended.title}`)
  if (fullC.length >= 8 && fullE.length >= 8 && fullC === fullE) return true

  const cc = canonicalSongCore(cand.author, cand.title)
  const ec = canonicalSongCore(ended.author, ended.title)
  if (compositionMatchFromCores(cc, ec, cand.author, ended.author)) {
    return true
  }

  if (cc.length >= 2 && ec.length >= 2 && cc === ec && artistsCompatibleForSameSong(cand.author, ended.author)) {
    return true
  }

  if (titlesLikelySameSong(cand.title, ended.title, cand.author, ended.author)) {
    return true
  }

  return false
}

/**
 * Spotify / metadata list: prefer other artists before same-artist recommendations.
 * @param {{ artist: string, title: string }[]} similar
 * @param {string} seedArtist
 * @returns {{ artist: string, title: string }[]}
 */
export function orderSimilarByArtistVariety(similar, seedArtist) {
  const others = []
  const same = []
  for (const s of similar) {
    if (isSamePrimaryArtist(seedArtist, s.artist)) same.push(s)
    else others.push(s)
  }
  return [...others, ...same]
}

/**
 * Lavalink search hits: other-artist first, then same-artist. Recently played tracks are
 * omitted entirely so autoplay cannot re-queue them until they fall out of history.
 * @param {(import("lavalink-client").Track | import("lavalink-client").UnresolvedTrack)[]} tracks
 * @param {string} seedArtist
 * @param {import("lavalink-client").TrackInfo | undefined} endedInfo
 * @param {import("lavalink-client").Player} player
 * @returns {(import("lavalink-client").Track | import("lavalink-client").UnresolvedTrack)[]}
 */
export function orderLavalinkTracksForAutoplay(tracks, seedArtist, endedInfo, player) {
  const otherArtist = []
  const sameArtist = []
  for (const t of tracks) {
    if (!t?.info) continue
    if (!isPlausibleAutoplayMusicTrack(t.info)) continue
    if (isDuplicateAutoplayCandidate(t.info, endedInfo)) continue
    if (isAutoplayRecentlyPlayed(player, t.info)) continue
    if (isSamePrimaryArtist(seedArtist, t.info.author)) sameArtist.push(t)
    else otherArtist.push(t)
  }
  return [...otherArtist, ...sameArtist]
}
