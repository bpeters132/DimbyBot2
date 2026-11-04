/**
 * Paths `/download` may pass to yt-dlp.
 * `https://www.youtube.com/attribution_link?u=/redirect?...&q=<target>` still has
 * hostname `www.youtube.com` and path `/attribution_link`. yt-dlp follows that
 * link through YouTube's redirector and requests `q` (loopback, link-local,
 * RFC1918). A `/redirect` path check does not see this URL. Only ordinary
 * watch, short, embed, live, playlist, and youtu.be video URLs are allowed.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,80}$/

function isYoutubeDownloadHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.+$/, "")
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")
}

/** Path segments after one decode and `.` / `..` resolution. */
function youtubeDownloadPathSegments(pathname: string): string[] {
    let decoded: string
    try {
        decoded = decodeURIComponent(pathname)
    } catch {
        decoded = pathname
    }
    const segments: string[] = []
    for (const part of decoded.split("/")) {
        if (part === "" || part === ".") continue
        if (part === "..") {
            segments.pop()
            continue
        }
        segments.push(part)
    }
    return segments
}

function isVideoId(value: string | undefined): boolean {
    return typeof value === "string" && VIDEO_ID.test(value)
}

/**
 * True when `/download` may pass `raw` to yt-dlp.
 * Ordinary watch, short, embed, live, playlist, and youtu.be URLs stay allowed.
 */
export function isAllowedYoutubeDownloadMediaUrl(raw: string): boolean {
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        return false
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    if (!isYoutubeDownloadHost(parsed.hostname)) return false

    const host = parsed.hostname.toLowerCase().replace(/\.+$/, "")
    const segments = youtubeDownloadPathSegments(parsed.pathname)
    if (host === "youtu.be") {
        return segments.length === 1 && isVideoId(segments[0])
    }

    const kind = segments[0]?.toLowerCase()
    if (kind === "watch" && segments.length === 1) {
        return isVideoId(parsed.searchParams.get("v") ?? undefined)
    }
    if (
        (kind === "shorts" || kind === "embed" || kind === "live" || kind === "v") &&
        segments.length === 2
    ) {
        return isVideoId(segments[1])
    }
    if (kind === "playlist" && segments.length === 1) {
        const list = parsed.searchParams.get("list")
        return typeof list === "string" && PLAYLIST_ID.test(list)
    }
    return false
}
