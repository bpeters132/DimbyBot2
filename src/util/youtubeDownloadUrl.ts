/**
 * Hosts `/download` may hand to yt-dlp.
 * Exact names only: a suffix check would allow `consent.youtube.com`, whose
 * extractor follows the `continue` query to an arbitrary URL.
 */
const YOUTUBE_DOWNLOAD_HOSTS = new Set([
    "youtu.be",
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
])

type YtDlpDownloadUrl = {
    protocol: string
    hostname: string
    pathname: string
}

/**
 * URL urllib (and therefore yt-dlp) will request.
 *
 * WHATWG treats `\` as `/`, so `http://www.youtube.com\@consent.youtube.com/`
 * is host `www.youtube.com`. urllib keeps `\` in userinfo and connects to the
 * host after `@`. Host and path checks must use this parse, or they disagree
 * and a second YouTube name can hide `/redirect` or `consent.youtube.com`.
 */
function parseYtDlpDownloadUrl(raw: string): YtDlpDownloadUrl | null {
    const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i.exec(raw.trim())
    if (!match) return null
    const protocol = (match[1] ?? "").toLowerCase()
    let authority = match[2] ?? ""
    const pathname = match[3] ?? ""
    const at = authority.lastIndexOf("@")
    if (at !== -1) authority = authority.slice(at + 1)
    if (!authority) return null
    let hostname: string
    if (authority.startsWith("[")) {
        const end = authority.indexOf("]")
        if (end === -1) return null
        hostname = authority.slice(1, end).toLowerCase()
    } else {
        const colon = authority.lastIndexOf(":")
        if (colon !== -1 && /^\d+$/.test(authority.slice(colon + 1))) {
            authority = authority.slice(0, colon)
        }
        hostname = authority.toLowerCase()
    }
    if (!hostname) return null
    return { protocol, hostname, pathname }
}

/** Hostname urllib (and therefore yt-dlp) will request. */
export function urllibRequestHostname(url: string): string | null {
    return parseYtDlpDownloadUrl(url)?.hostname ?? null
}

/**
 * Path segments after one decode, then `.` / `..` resolution.
 * `\` in the path is folded to `/` so `redirect\videos` stays a redirect.
 * That fold must not run on the authority: urllib keeps `\` in userinfo.
 */
function youtubeDownloadPathSegments(pathname: string): string[] {
    let decoded: string
    try {
        decoded = decodeURIComponent(pathname)
    } catch {
        decoded = pathname
    }
    const segments: string[] = []
    for (const part of decoded.replaceAll("\\", "/").split("/")) {
        if (part === "" || part === ".") continue
        if (part === "..") {
            segments.pop()
            continue
        }
        segments.push(part.toLowerCase())
    }
    return segments
}

/**
 * True when `/download` may pass `url` to yt-dlp.
 * The host urllib will request must be an exact download host, and the path
 * urllib will request must not be YouTube's `/redirect` endpoint.
 */
export function isAllowedYoutubeDownloadUrl(url: string): boolean {
    const parsed = parseYtDlpDownloadUrl(url)
    if (!parsed) return false
    if (parsed.protocol !== "http" && parsed.protocol !== "https") return false
    if (!YOUTUBE_DOWNLOAD_HOSTS.has(parsed.hostname)) return false
    return youtubeDownloadPathSegments(parsed.pathname)[0] !== "redirect"
}
