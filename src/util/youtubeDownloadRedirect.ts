/**
 * `/download` hands the URL to yt-dlp after a YouTube hostname check.
 * `https://www.youtube.com/redirect?...&q=<target>` still has hostname
 * `www.youtube.com`. yt-dlp rewrites that path to `/redirect/videos` and
 * follows YouTube's redirect to `q`, so the bot requests whatever host was
 * in the query (loopback, link-local, RFC1918).
 */

function youtubeDownloadHost(hostname: string): boolean {
    const host = hostname.toLowerCase()
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
        segments.push(part.toLowerCase())
    }
    return segments
}

/**
 * True when `/download` may pass `raw` to yt-dlp.
 * Ordinary watch, short, and youtu.be URLs stay allowed. YouTube's `/redirect`
 * endpoint is refused even when the host is `www.youtube.com`.
 */
export function isAllowedYoutubeDownloadUrl(raw: string): boolean {
    let parsed: URL
    try {
        parsed = new URL(raw)
    } catch {
        return false
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    if (!youtubeDownloadHost(parsed.hostname)) return false
    return youtubeDownloadPathSegments(parsed.pathname)[0] !== "redirect"
}
