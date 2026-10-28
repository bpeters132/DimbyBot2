/**
 * YouTube hosts `/download` may hand to yt-dlp.
 * `youtu.be` is exact; `youtube.com` includes subdomains such as `www` and `music`.
 */
export function isYoutubeDownloadHost(hostname: string): boolean {
    const host = hostname.toLowerCase()
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")
}

/**
 * Hostname urllib (and therefore yt-dlp) will request.
 *
 * WHATWG treats `\` as `/`, so `http://www.youtube.com\@127.0.0.1/` is host
 * `www.youtube.com`. urllib keeps `\` inside userinfo and connects to `127.0.0.1`.
 * `/download` must allow the URL only when that fetched host is YouTube.
 */
export function urllibRequestHostname(url: string): string | null {
    const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url.trim())
    if (!match) return null
    let authority = match[1] ?? ""
    const at = authority.lastIndexOf("@")
    if (at !== -1) authority = authority.slice(at + 1)
    if (!authority) return null
    if (authority.startsWith("[")) {
        const end = authority.indexOf("]")
        if (end === -1) return null
        return authority.slice(1, end).toLowerCase()
    }
    const colon = authority.lastIndexOf(":")
    if (colon !== -1 && /^\d+$/.test(authority.slice(colon + 1))) {
        authority = authority.slice(0, colon)
    }
    const host = authority.toLowerCase()
    return host || null
}

/** True when yt-dlp would fetch a YouTube host for this `/download` URL. */
export function isAllowedYoutubeDownloadUrl(url: string): boolean {
    const host = urllibRequestHostname(url)
    if (!host) return false
    return isYoutubeDownloadHost(host)
}
