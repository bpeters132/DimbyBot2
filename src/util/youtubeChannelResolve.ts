const YOUTUBE_CHANNEL_ID_RE = /^UC[\w-]{22}$/
const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/
const HANDLE_RE = /^@[\w.-]{1,30}$/

export type YoutubeChannelIdentity = {
    channelId: string
    displayName: string
}

export type YoutubeFetch = (url: string) => Promise<{ ok: boolean; status: number; text: string }>

const DEFAULT_UA =
    "Mozilla/5.0 (compatible; DimbyBot2/0.2; +https://github.com/DimbyBot2) upload-alerts"

/** Default HTTP GET used to resolve handles and scrape channel IDs. */
export async function defaultYoutubeFetch(url: string): Promise<{
    ok: boolean
    status: number
    text: string
}> {
    const res = await fetch(url, {
        headers: { "User-Agent": DEFAULT_UA, "Accept-Language": "en-US,en;q=0.9" },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
}

/** True when `value` is a canonical YouTube channel id (UC…). */
export function isYoutubeChannelId(value: string): boolean {
    return YOUTUBE_CHANNEL_ID_RE.test(value.trim())
}

/** Pulls a UC… channel id out of HTML, JSON, or a URL string. */
export function extractYoutubeChannelId(text: string): string | null {
    const fromUrl = text.match(/youtube\.com\/channel\/(UC[\w-]{22})/i)
    if (fromUrl?.[1] && isYoutubeChannelId(fromUrl[1])) return fromUrl[1]
    const fromJson = text.match(/"channelId"\s*:\s*"(UC[\w-]{22})"/)
    if (fromJson?.[1]) return fromJson[1]
    const fromExternal = text.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/)
    if (fromExternal?.[1]) return fromExternal[1]
    const bare = text.trim()
    if (isYoutubeChannelId(bare)) return bare
    return null
}

function youtubeHosts(hostname: string): boolean {
    const host = hostname.toLowerCase()
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")
}

function videoIdFromUrl(parsed: URL): string | null {
    const host = parsed.hostname.toLowerCase()
    if (host === "youtu.be") {
        const id = parsed.pathname.split("/").filter(Boolean)[0] ?? null
        return id && YOUTUBE_VIDEO_ID_RE.test(id) ? id : null
    }
    if (parsed.pathname === "/watch" || parsed.pathname.endsWith("/watch")) {
        const id = parsed.searchParams.get("v")
        return id && YOUTUBE_VIDEO_ID_RE.test(id) ? id : null
    }
    const parts = parsed.pathname.split("/").filter(Boolean)
    const kind = parts[0]
    const candidate = parts[1]
    if (
        (kind === "embed" || kind === "v" || kind === "shorts" || kind === "live") &&
        candidate &&
        YOUTUBE_VIDEO_ID_RE.test(candidate)
    ) {
        return candidate
    }
    return null
}

/**
 * Parses an admin-provided YouTube identity into a fetch plan.
 * Accepts UC… IDs, @handles, channel/video URLs.
 */
export function parseYoutubeChannelInput(
    raw: string
):
    | { kind: "channelId"; channelId: string }
    | { kind: "handle"; handle: string }
    | { kind: "videoId"; videoId: string }
    | { kind: "page"; url: string }
    | { kind: "invalid"; reason: string } {
    const trimmed = raw.trim()
    if (!trimmed) return { kind: "invalid", reason: "YouTube channel is required." }
    if (isYoutubeChannelId(trimmed)) return { kind: "channelId", channelId: trimmed }
    if (HANDLE_RE.test(trimmed)) return { kind: "handle", handle: trimmed }

    try {
        const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`)
        if (!youtubeHosts(url.hostname)) {
            return { kind: "invalid", reason: "That is not a YouTube URL." }
        }
        const channelFromPath = extractYoutubeChannelId(url.href)
        if (channelFromPath) return { kind: "channelId", channelId: channelFromPath }
        const parts = url.pathname.split("/").filter(Boolean)
        if (parts[0]?.startsWith("@")) {
            const handle = parts[0]
            if (HANDLE_RE.test(handle)) return { kind: "handle", handle }
        }
        const videoId = videoIdFromUrl(url)
        if (videoId) return { kind: "videoId", videoId }
        if (parts[0] === "c" || parts[0] === "user" || parts[0] === "@") {
            return { kind: "page", url: url.toString() }
        }
        return { kind: "page", url: url.toString() }
    } catch {
        if (HANDLE_RE.test(`@${trimmed}`)) return { kind: "handle", handle: `@${trimmed}` }
        return { kind: "invalid", reason: "Could not parse that YouTube channel." }
    }
}

function displayNameFromFeedOrHtml(text: string, fallback: string): string {
    const feedTitle = text.match(/<title>([^<]+)<\/title>/i)
    if (feedTitle?.[1]) {
        const name = decodeXml(feedTitle[1])
            .replace(/\s*-\s*YouTube\s*$/i, "")
            .trim()
        if (name) return name
    }
    const og = text.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    if (og?.[1]) {
        const name = og[1].replace(/\s*-\s*YouTube\s*$/i, "").trim()
        if (name) return name
    }
    return fallback
}

function decodeXml(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
}

async function identityFromChannelId(
    channelId: string,
    fetchImpl: YoutubeFetch
): Promise<YoutubeChannelIdentity | null> {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
    const res = await fetchImpl(feedUrl)
    if (!res.ok) return null
    return { channelId, displayName: displayNameFromFeedOrHtml(res.text, channelId) }
}

async function identityFromPage(
    url: string,
    fetchImpl: YoutubeFetch
): Promise<YoutubeChannelIdentity | null> {
    const res = await fetchImpl(url)
    if (!res.ok) return null
    const channelId = extractYoutubeChannelId(res.text)
    if (!channelId) return null
    const fromFeed = await identityFromChannelId(channelId, fetchImpl)
    if (fromFeed) return fromFeed
    return { channelId, displayName: displayNameFromFeedOrHtml(res.text, channelId) }
}

/**
 * Resolves an admin paste (URL, @handle, or UC… ID) to a canonical channel id and display name.
 * Returns null when YouTube cannot be resolved.
 */
export async function resolveYoutubeChannel(
    raw: string,
    fetchImpl: YoutubeFetch = defaultYoutubeFetch
): Promise<YoutubeChannelIdentity | null> {
    const parsed = parseYoutubeChannelInput(raw)
    if (parsed.kind === "invalid") return null
    if (parsed.kind === "channelId") {
        return identityFromChannelId(parsed.channelId, fetchImpl)
    }
    if (parsed.kind === "handle") {
        return identityFromPage(`https://www.youtube.com/${parsed.handle}`, fetchImpl)
    }
    if (parsed.kind === "page") {
        return identityFromPage(parsed.url, fetchImpl)
    }
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${parsed.videoId}`)}&format=json`
    const oembed = await fetchImpl(oembedUrl)
    if (oembed.ok) {
        try {
            const body = JSON.parse(oembed.text) as { author_url?: string; author_name?: string }
            if (body.author_url) {
                const fromAuthor = await identityFromPage(body.author_url, fetchImpl)
                if (fromAuthor) {
                    return {
                        channelId: fromAuthor.channelId,
                        displayName: body.author_name?.trim() || fromAuthor.displayName,
                    }
                }
            }
        } catch {
            // Fall through to the watch page.
        }
    }
    return identityFromPage(`https://www.youtube.com/watch?v=${parsed.videoId}`, fetchImpl)
}
