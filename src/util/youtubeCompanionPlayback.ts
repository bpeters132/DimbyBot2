import type { Player, Track, UnresolvedTrack } from "lavalink-client"
import type { LoggerInterface } from "../types/index.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

/** Opus (251) then AAC (140) — Lavalink prefers Opus when the HTTP source can play it. */
export const PREFERRED_AUDIO_ITAGS = [251, 140] as const

const LOG_PREFIX = "[YoutubeCompanion]"

const YOUTUBE_VIDEO_ID_RE = /^[\w-]{11}$/
const COMPANION_READY_RETRIES = 4
const COMPANION_READY_RETRY_MS = 1500
/** Per-attempt AbortSignal.timeout for companion HTTP (Node >= 24). */
export const COMPANION_FETCH_TIMEOUT_MS = 10_000
const DEFAULT_COMPANION_ORIGIN = "http://invidious-companion:8282"

export type CompanionFetch = (
    input: string,
    init?: {
        method?: string
        headers?: Record<string, string>
        body?: string
        redirect?: "error" | "follow" | "manual"
        signal?: AbortSignal
    }
) => Promise<Response>

export type CompanionPlaybackConfig = {
    origin: string
    secretKey: string
    fetchImpl?: CompanionFetch
    sleep?: (ms: number) => Promise<void>
    logger?: Partial<LoggerInterface>
    /** Override {@link COMPANION_FETCH_TIMEOUT_MS} (tests). */
    fetchTimeoutMs?: number
}

type FormatLike = {
    itag?: number
    mimeType?: string
    mime_type?: string
}

type PlayerJsonLike = {
    playabilityStatus?: { status?: string; reason?: string }
    playability_status?: { status?: string; reason?: string }
    streamingData?: { formats?: FormatLike[]; adaptiveFormats?: FormatLike[] }
    streaming_data?: { formats?: FormatLike[]; adaptive_formats?: FormatLike[] }
    videoDetails?: { lengthSeconds?: string | number }
    video_details?: { length_seconds?: string | number }
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Reads companion origin + 16-char secret from env. Returns null when unset. */
export function companionPlaybackConfigFromEnv(): CompanionPlaybackConfig | null {
    const origin = (process.env.INVIDIOUS_COMPANION_URL ?? DEFAULT_COMPANION_ORIGIN)
        .trim()
        .replace(/\/+$/, "")
    const secretKey = (process.env.INVIDIOUS_COMPANION_KEY ?? "").trim()
    if (!origin || !secretKey) return null
    return { origin, secretKey }
}

/**
 * Env companion config plus an optional bot logger. Empty secret still returns a
 * config object so missing-env can be warned on the Bot log before throw.
 */
export function companionPlaybackConfig(
    logger?: Partial<LoggerInterface>
): CompanionPlaybackConfig | null {
    const env = companionPlaybackConfigFromEnv()
    if (!env) {
        return { origin: DEFAULT_COMPANION_ORIGIN, secretKey: "", logger }
    }
    return { ...env, logger }
}

function companionLogger(config: CompanionPlaybackConfig | null | undefined): LoggerInterface {
    return loggerFromPartial(config?.logger)
}

export function youtubeVideoIdFromTrack(track: Track | UnresolvedTrack): string | null {
    const source = track.info?.sourceName
    if (source && source !== "youtube" && source !== "youtubemusic") return null
    const id = track.info?.identifier?.trim()
    if (id && YOUTUBE_VIDEO_ID_RE.test(id)) return id
    return youtubeVideoIdFromUri(track.info?.uri?.trim() ?? "")
}

/** Parses an 11-character video id from common YouTube URL shapes. */
export function youtubeVideoIdFromUri(uri: string): string | null {
    if (!uri) return null
    try {
        const url = new URL(uri)
        const host = url.hostname.replace(/^www\./, "")
        if (host === "youtu.be") {
            const id = url.pathname.split("/").filter(Boolean)[0]
            return id && YOUTUBE_VIDEO_ID_RE.test(id) ? id : null
        }
        if (host === "youtube.com" || host === "music.youtube.com" || host === "m.youtube.com") {
            const v = url.searchParams.get("v")
            if (v && YOUTUBE_VIDEO_ID_RE.test(v)) return v
            const parts = url.pathname.split("/").filter(Boolean)
            if (
                (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") &&
                parts[1]
            ) {
                return YOUTUBE_VIDEO_ID_RE.test(parts[1]) ? parts[1] : null
            }
        }
    } catch {
        return null
    }
    return null
}

export function isYoutubeSourceTrack(track: Track | UnresolvedTrack): boolean {
    const source = track.info?.sourceName
    if (source === "youtube" || source === "youtubemusic") return true
    if (source) return false
    return Boolean(youtubeVideoIdFromUri(track.info?.uri?.trim() ?? ""))
}

/** True for open.spotify.com / play.spotify.com catalog URIs (no native audio). */
export function isSpotifyCatalogUri(uri: string): boolean {
    if (!uri) return false
    try {
        const url = new URL(uri)
        const host = url.hostname.replace(/^www\./, "")
        return host === "open.spotify.com" || host === "play.spotify.com"
    } catch {
        return uri.startsWith("spotify:track:")
    }
}

/** Metadata-only Spotify item that must be YouTube-searched before companion playback. */
export function isSpotifyCatalogTrack(track: Track | UnresolvedTrack): boolean {
    const source = track.info?.sourceName
    if (source === "spotify") return true
    if (source) return false
    return isSpotifyCatalogUri(track.info?.uri?.trim() ?? "")
}

/**
 * LavaSrc-compatible YouTube searches: quoted ISRC, then quoted title + author.
 * Title/author must stay quoted: lavalink-client strips `ytsearch:` and treats a bare
 * `http(s)://…` remainder as a raw `/loadtracks` identifier (SSRF via playlist metadata).
 */
export function catalogYoutubeSearchQueries(track: Track | UnresolvedTrack): string[] {
    const queries: string[] = []
    const isrc = track.info?.isrc?.trim()
    if (isrc) queries.push(`ytsearch:"${stripEmbeddedQuotes(isrc)}"`)
    const title = track.info?.title?.trim() ?? ""
    const author = track.info?.author?.trim() ?? ""
    const q = `${title} ${author}`.trim()
    if (q) queries.push(`ytsearch:"${stripEmbeddedQuotes(q)}"`)
    return queries
}

function stripEmbeddedQuotes(value: string): string {
    return value.replace(/"/g, "")
}

const COMPANION_RESOLVED_FLAG = "invidiousCompanionResolved"

/** True when this queue item already has a Companion stream URL minted. */
export function isCompanionResolvedTrack(track: Track | UnresolvedTrack): boolean {
    const userData = (track as { userData?: unknown }).userData
    return (
        typeof userData === "object" &&
        userData !== null &&
        (userData as Record<string, unknown>)[COMPANION_RESOLVED_FLAG] === true
    )
}

export function collectPlayerFormats(playerJson: PlayerJsonLike): FormatLike[] {
    const camel = playerJson.streamingData
    const snake = playerJson.streaming_data
    const formats = [
        ...(camel?.formats ?? []),
        ...(camel?.adaptiveFormats ?? []),
        ...(snake?.formats ?? []),
        ...(snake?.adaptive_formats ?? []),
    ]
    return formats
}

/** Prefers itag 251 (Opus) then 140 (AAC); otherwise the first audio mimeType. */
export function pickPreferredAudioItag(formats: FormatLike[]): number | null {
    const itags = new Set(
        formats.map((f) => f.itag).filter((n): n is number => typeof n === "number")
    )
    for (const preferred of PREFERRED_AUDIO_ITAGS) {
        if (itags.has(preferred)) return preferred
    }
    const audio = formats.find((f) => {
        const mime = f.mimeType ?? f.mime_type ?? ""
        return mime.startsWith("audio/")
    })
    return typeof audio?.itag === "number" ? audio.itag : null
}

export function companionLatestVersionPath(videoId: string, itag: number): string {
    return `/companion/latest_version?id=${encodeURIComponent(videoId)}&itag=${encodeURIComponent(String(itag))}&local=true`
}

/** Turns a companion redirect (relative or absolute) into an origin-absolute URL Lavalink can fetch. */
export function resolveCompanionRedirectUrl(location: string, companionOrigin: string): string {
    const origin = companionOrigin.replace(/\/+$/, "")
    try {
        const resolved = new URL(location, `${origin}/`)
        if (resolved.hostname === "localhost" || resolved.hostname === "127.0.0.1") {
            const companion = new URL(origin)
            resolved.protocol = companion.protocol
            resolved.host = companion.host
        }
        return resolved.toString()
    } catch {
        if (location.startsWith("/")) return `${origin}${location}`
        return location
    }
}

/**
 * Ensures Lavalink fetches audio via companion, not googlevideo.
 * Rewrites googlevideo URLs onto companion's `/companion/videoplayback` proxy.
 */
export function ensureCompanionOriginStreamUrl(streamUrl: string, companionOrigin: string): string {
    const origin = companionOrigin.replace(/\/+$/, "")
    const companion = new URL(origin)
    let parsed: URL
    try {
        parsed = new URL(streamUrl, `${origin}/`)
    } catch {
        throw new Error("invidious-companion returned an invalid stream URL.")
    }
    if (parsed.host === companion.host) return parsed.toString()
    if (parsed.hostname.endsWith(".googlevideo.com")) {
        const proxy = new URL("/companion/videoplayback", `${origin}/`)
        proxy.search = parsed.search
        proxy.searchParams.set("host", parsed.hostname)
        return proxy.toString()
    }
    throw new Error(`Refusing to play non-companion HTTP URL (host ${parsed.host}).`)
}

/** Companion player JSON video length in ms, or null when missing/invalid. */
export function companionLengthMsFromPlayerJson(playerJson: {
    videoDetails?: { lengthSeconds?: string | number }
    video_details?: { length_seconds?: string | number }
}): number | null {
    const raw = playerJson.videoDetails?.lengthSeconds ?? playerJson.video_details?.length_seconds
    const seconds = typeof raw === "string" ? Number(raw) : raw
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return Math.floor(seconds * 1000)
}

/**
 * Stamps Playback duration: Lavalink HTTP if > 0, else companion length, else YouTube search.
 * A finite stamp also clears `isStream` so the UIs do not show LIVE.
 */
export function applyPlaybackDuration(
    httpTrack: Track,
    fallbacks: {
        companionLengthMs?: number | null
        youtubeSearchDurationMs?: number | null
    }
): Track {
    const httpMs = httpTrack.info.duration
    const companionMs = fallbacks.companionLengthMs
    const youtubeMs = fallbacks.youtubeSearchDurationMs
    const stamped =
        typeof httpMs === "number" && httpMs > 0
            ? httpMs
            : typeof companionMs === "number" && companionMs > 0
              ? companionMs
              : typeof youtubeMs === "number" && youtubeMs > 0
                ? youtubeMs
                : null
    if (stamped != null) {
        httpTrack.info.duration = stamped
        httpTrack.info.isStream = false
    }
    return httpTrack
}

export function overlayYoutubeMetadata(
    httpTrack: Track,
    youtubeTrack: Track | UnresolvedTrack
): Track {
    const info = httpTrack.info
    const src = youtubeTrack.info
    if (src.title) info.title = src.title
    if (src.author) info.author = src.author
    if (src.uri) info.uri = src.uri
    if (src.identifier) info.identifier = src.identifier
    if (src.artworkUrl) info.artworkUrl = src.artworkUrl
    info.sourceName = "youtube"
    info.isSeekable = src.isSeekable ?? info.isSeekable
    info.isStream = src.isStream ?? info.isStream
    httpTrack.requester = youtubeTrack.requester
    const youtubeUserData = (youtubeTrack as { userData?: unknown }).userData
    const mergedUserData: Record<string, unknown> =
        typeof youtubeUserData === "object" && youtubeUserData !== null
            ? { ...(youtubeUserData as Record<string, unknown>) }
            : {}
    mergedUserData[COMPANION_RESOLVED_FLAG] = true
    ;(httpTrack as { userData?: unknown }).userData = mergedUserData
    return httpTrack
}

/**
 * Copies catalog (Spotify) title/artist/ISRC onto a companion HTTP track.
 * Leaves `info.uri` as the YouTube watch URL from YouTube search so now-playing
 * and the dashboard link to what is actually streaming.
 */
export function overlayCatalogIdentity(
    httpTrack: Track,
    catalogTrack: Track | UnresolvedTrack
): Track {
    const info = httpTrack.info
    const src = catalogTrack.info
    if (src.title) info.title = src.title
    if (src.author) info.author = src.author
    if (src.identifier) info.identifier = src.identifier
    if (src.artworkUrl) info.artworkUrl = src.artworkUrl
    if (src.isrc) info.isrc = src.isrc
    info.sourceName = src.sourceName || "spotify"
    info.isSeekable = src.isSeekable ?? info.isSeekable
    info.isStream = src.isStream ?? info.isStream
    httpTrack.requester = catalogTrack.requester
    const existing = (httpTrack as { userData?: unknown }).userData
    const mergedUserData: Record<string, unknown> =
        typeof existing === "object" && existing !== null
            ? { ...(existing as Record<string, unknown>) }
            : {}
    const catalogUserData = (catalogTrack as { userData?: unknown }).userData
    if (typeof catalogUserData === "object" && catalogUserData !== null) {
        Object.assign(mergedUserData, catalogUserData as Record<string, unknown>)
    }
    mergedUserData[COMPANION_RESOLVED_FLAG] = true
    ;(httpTrack as { userData?: unknown }).userData = mergedUserData
    return httpTrack
}

function playabilityStatus(playerJson: PlayerJsonLike): { status: string; reason?: string } {
    const status =
        playerJson.playabilityStatus?.status ?? playerJson.playability_status?.status ?? "OK"
    const reason = playerJson.playabilityStatus?.reason ?? playerJson.playability_status?.reason
    return { status, reason }
}

async function companionFetchWithRetry(
    url: string,
    init: {
        method?: string
        headers?: Record<string, string>
        body?: string
        redirect?: "error" | "follow" | "manual"
        signal?: AbortSignal
    },
    config: CompanionPlaybackConfig,
    label: string
): Promise<Response> {
    const fetchImpl = config.fetchImpl ?? fetch
    const sleep = config.sleep ?? defaultSleep
    const log = companionLogger(config)
    let last: Response | undefined
    for (let attempt = 0; attempt < COMPANION_READY_RETRIES; attempt++) {
        const timeout = AbortSignal.timeout(config.fetchTimeoutMs ?? COMPANION_FETCH_TIMEOUT_MS)
        const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
        try {
            const res = await fetchImpl(url, { ...init, signal })
            last = res
            if (res.status !== 503) return res
            if (attempt < COMPANION_READY_RETRIES - 1) {
                log.debug(
                    `${LOG_PREFIX} companion 503 retry ${attempt + 1}/${COMPANION_READY_RETRIES} for ${label}`
                )
                await sleep(COMPANION_READY_RETRY_MS * (attempt + 1))
            }
        } catch (err: unknown) {
            if (isAbortError(err) && attempt < COMPANION_READY_RETRIES - 1) {
                log.debug(
                    `${LOG_PREFIX} companion timeout retry ${attempt + 1}/${COMPANION_READY_RETRIES} for ${label}`
                )
                await sleep(COMPANION_READY_RETRY_MS * (attempt + 1))
                continue
            }
            throw err
        }
    }
    return last as Response
}

function isAbortError(err: unknown): boolean {
    return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")
}

async function fetchCompanionPlayerJson(
    videoId: string,
    config: CompanionPlaybackConfig
): Promise<PlayerJsonLike> {
    const url = `${config.origin.replace(/\/+$/, "")}/companion/youtubei/v1/player`
    const res = await companionFetchWithRetry(
        url,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.secretKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ videoId }),
        },
        config,
        `player ${videoId}`
    )
    if (!res.ok) {
        const text = await res.text().catch(() => "")
        const message = `invidious-companion player failed (${res.status}) for ${videoId}: ${text.slice(0, 200)}`
        companionLogger(config).error(`${LOG_PREFIX} ${message}`)
        throw new Error(message)
    }
    return (await res.json()) as PlayerJsonLike
}

async function fetchCompanionStreamUrl(
    videoId: string,
    itag: number,
    config: CompanionPlaybackConfig
): Promise<string> {
    const origin = config.origin.replace(/\/+$/, "")
    const url = `${origin}${companionLatestVersionPath(videoId, itag)}`
    const res = await companionFetchWithRetry(
        url,
        {
            method: "GET",
            headers: { Authorization: `Bearer ${config.secretKey}` },
            redirect: "manual",
        },
        config,
        `latest_version ${videoId} itag=${itag}`
    )
    if (
        res.status === 301 ||
        res.status === 302 ||
        res.status === 303 ||
        res.status === 307 ||
        res.status === 308
    ) {
        const location = res.headers.get("location")
        if (!location) {
            const message = `invidious-companion latest_version redirected without Location for ${videoId}`
            companionLogger(config).error(`${LOG_PREFIX} ${message}`)
            throw new Error(message)
        }
        return resolveCompanionRedirectUrl(location, origin)
    }
    if (!res.ok) {
        const text = await res.text().catch(() => "")
        const message = `invidious-companion latest_version failed (${res.status}) for ${videoId} itag=${itag}: ${text.slice(0, 200)}`
        companionLogger(config).error(`${LOG_PREFIX} ${message}`)
        throw new Error(message)
    }
    return url
}

async function resolveSpotifyCatalogPlaybackTrack(
    player: Player,
    track: Track | UnresolvedTrack,
    config: CompanionPlaybackConfig | null
): Promise<Track | UnresolvedTrack> {
    const log = companionLogger(config)
    const id = track.info?.identifier?.trim() || "unknown"
    const queries = catalogYoutubeSearchQueries(track)
    if (queries.length === 0) {
        log.warn(`${LOG_PREFIX} catalog track ${id} has no ISRC or title for YouTube search`)
        throw new Error(`No YouTube search result for Spotify catalog track ${id}.`)
    }

    let youtubeHit: Track | UnresolvedTrack | undefined
    for (const query of queries) {
        log.debug(`${LOG_PREFIX} catalog searching YouTube for ${id}`)
        try {
            const res = await player.search(query, track.requester)
            youtubeHit = (res?.tracks ?? []).find((candidate) => isYoutubeSourceTrack(candidate))
            if (youtubeHit) break
        } catch {
            log.warn(`${LOG_PREFIX} catalog YouTube search failed for ${id}`)
        }
    }
    if (!youtubeHit) {
        log.warn(`${LOG_PREFIX} catalog YouTube search miss for ${id}`)
        throw new Error(`No YouTube search result for Spotify catalog track ${id}.`)
    }

    const httpTrack = await resolveYoutubePlaybackTrack(player, youtubeHit, config)
    return overlayCatalogIdentity(httpTrack as Track, track)
}

/**
 * Prepares a track for queue.add: YouTube → companion HTTP; Spotify catalog → YouTube
 * search then companion HTTP (Spotify title/artist kept; Playback URL is the YouTube
 * watch URL). Other sources unchanged.
 * Throws if companion is missing, the video is unplayable, or catalog YouTube search misses.
 */
export async function resolveYoutubePlaybackTrack(
    player: Player,
    track: Track | UnresolvedTrack,
    config: CompanionPlaybackConfig | null = companionPlaybackConfigFromEnv(),
    options?: { force?: boolean }
): Promise<Track | UnresolvedTrack> {
    const log = companionLogger(config)
    if (!options?.force && isCompanionResolvedTrack(track)) return track
    if (isSpotifyCatalogTrack(track)) {
        return resolveSpotifyCatalogPlaybackTrack(player, track, config)
    }
    if (!isYoutubeSourceTrack(track)) return track
    const videoId = youtubeVideoIdFromTrack(track)
    if (!videoId) return track
    if (!config?.secretKey) {
        log.warn(
            `${LOG_PREFIX} missing INVIDIOUS_COMPANION_URL or INVIDIOUS_COMPANION_KEY; cannot resolve ${videoId}`
        )
        throw new Error(
            "YouTube playback requires invidious-companion (set INVIDIOUS_COMPANION_URL and INVIDIOUS_COMPANION_KEY)."
        )
    }

    log.debug(`${LOG_PREFIX} resolving ${videoId}`)
    const playerJson = await fetchCompanionPlayerJson(videoId, config)
    const playability = playabilityStatus(playerJson)
    if (playability.status && playability.status !== "OK") {
        const reason = playability.reason ?? playability.status
        log.warn(`${LOG_PREFIX} playability not OK for ${videoId}: ${reason}`)
        throw new Error(`invidious-companion cannot play ${videoId}: ${reason}`)
    }

    const formats = collectPlayerFormats(playerJson)
    const itag = pickPreferredAudioItag(formats) ?? PREFERRED_AUDIO_ITAGS[0]
    log.debug(`${LOG_PREFIX} itag ${itag} for ${videoId}`)
    const streamUrl = ensureCompanionOriginStreamUrl(
        await fetchCompanionStreamUrl(videoId, itag, config),
        config.origin
    )

    const search = await player.search(streamUrl, track.requester)
    const httpTrack = search?.tracks?.[0]
    if (!httpTrack || !("encoded" in httpTrack) || typeof httpTrack.encoded !== "string") {
        log.error(`${LOG_PREFIX} Lavalink HTTP search returned no track for ${videoId}`)
        throw new Error(`Lavalink HTTP search returned no track for companion stream ${videoId}.`)
    }
    log.debug(`${LOG_PREFIX} resolved ${videoId}`)
    const overlaid = overlayYoutubeMetadata(httpTrack as Track, track)
    return applyPlaybackDuration(overlaid, {
        companionLengthMs: companionLengthMsFromPlayerJson(playerJson),
        youtubeSearchDurationMs: track.info?.duration,
    })
}

const RESOLVE_CONCURRENCY = 6

/**
 * Resolves YouTube and Spotify catalog tracks in parallel (order preserved).
 * Unplayable items are skipped (playlist fail-closed per track) and logged.
 */
export async function resolveYoutubePlaybackTracks(
    player: Player,
    tracks: Array<Track | UnresolvedTrack>,
    config: CompanionPlaybackConfig | null = companionPlaybackConfigFromEnv()
): Promise<Array<Track | UnresolvedTrack>> {
    if (tracks.length === 0) return tracks
    const log = companionLogger(config)
    const slots: Array<Track | UnresolvedTrack | undefined> = new Array(tracks.length)
    let nextIndex = 0

    async function worker(): Promise<void> {
        while (true) {
            const i = nextIndex++
            if (i >= tracks.length) return
            const original = tracks[i]!
            try {
                slots[i] = await resolveYoutubePlaybackTrack(player, original, config)
            } catch (err: unknown) {
                const id = original.info?.identifier?.trim() || original.info?.title || "unknown"
                const msg = err instanceof Error ? err.message : String(err)
                log.warn(`${LOG_PREFIX} skipping unplayable track ${id}: ${msg}`)
            }
        }
    }

    const workerCount = Math.min(RESOLVE_CONCURRENCY, tracks.length)
    await Promise.all(Array.from({ length: workerCount }, () => worker()))
    return slots.filter((track): track is Track | UnresolvedTrack => Boolean(track))
}
