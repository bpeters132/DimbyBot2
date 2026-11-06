/**
 * Paths `/download` may pass to yt-dlp, on top of the urllib host and
 * `/redirect` checks. `attribution_link?u=/redirect?...&q=<target>` still has
 * an exact YouTube hostname and a path that is not `/redirect`. yt-dlp follows
 * that link through YouTube's redirector and requests `q`. Only ordinary
 * watch, short, embed, live, playlist, and youtu.be URLs are allowed.
 *
 * Host and path come from the urllib parse, not `new URL`. WHATWG treats `\`
 * as `/`, so a suffix host check would allow `consent.youtube.com` and a
 * backslash in userinfo would hide the host yt-dlp actually requests.
 */

import {
    YOUTUBE_DOWNLOAD_HOSTS,
    parseYtDlpDownloadUrl,
    youtubeDownloadPathSegments,
} from "./youtubeDownloadUrl.js"

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,80}$/

function isVideoId(value: string | undefined): boolean {
    return typeof value === "string" && VIDEO_ID.test(value)
}

function queryParam(search: string, name: string): string | undefined {
    return new URLSearchParams(search).get(name) ?? undefined
}

/**
 * True when `/download` may pass `raw` to yt-dlp as an ordinary media URL.
 * Callers still apply the urllib host and `/redirect` checks. This rejects
 * every other path, including `attribution_link`.
 */
export function isAllowedYoutubeDownloadMediaUrl(raw: string): boolean {
    const parsed = parseYtDlpDownloadUrl(raw)
    if (!parsed) return false
    if (parsed.protocol !== "http" && parsed.protocol !== "https") return false
    if (!YOUTUBE_DOWNLOAD_HOSTS.has(parsed.hostname)) return false

    const segments = youtubeDownloadPathSegments(parsed.pathname)
    if (parsed.hostname === "youtu.be") {
        return segments.length === 1 && isVideoId(segments[0])
    }

    const kind = segments[0]
    if (kind === "watch" && segments.length === 1) {
        return isVideoId(queryParam(parsed.search, "v"))
    }
    if (
        (kind === "shorts" || kind === "embed" || kind === "live" || kind === "v") &&
        segments.length === 2
    ) {
        return isVideoId(segments[1])
    }
    if (kind === "playlist" && segments.length === 1) {
        const list = queryParam(parsed.search, "list")
        return typeof list === "string" && PLAYLIST_ID.test(list)
    }
    return false
}
