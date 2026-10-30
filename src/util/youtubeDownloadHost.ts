/**
 * Hosts `/download` may pass to yt-dlp.
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

/**
 * True when `url` is an http(s) URL on a downloadable YouTube host.
 * Rejects other `*.youtube.com` names, including `consent.youtube.com`.
 */
export function isAllowedYoutubeDownloadHostUrl(url: string): boolean {
    let parsed: URL
    try {
        parsed = new URL(url.trim())
    } catch {
        return false
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
    const host = parsed.hostname.toLowerCase().replace(/\.+$/, "")
    return YOUTUBE_DOWNLOAD_HOSTS.has(host)
}
