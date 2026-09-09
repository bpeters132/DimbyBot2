/** One entry from a YouTube Atom/RSS channel feed or a PubSub ping. */
export type YoutubeFeedEntry = {
    videoId: string
    channelId: string | null
    title: string
    url: string
    published: string | null
    durationSeconds: number | null
    description: string
}

function decodeXml(value: string): string {
    return value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
}

function tag(block: string, name: string): string | null {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")
    const match = block.match(re)
    return match?.[1] ? decodeXml(match[1].trim()) : null
}

function attr(block: string, name: string, attrName: string): string | null {
    const re = new RegExp(`<${name}[^>]*\\b${attrName}="([^"]+)"`, "i")
    const match = block.match(re)
    return match?.[1] ?? null
}

function parseDuration(raw: string | null): number | null {
    if (!raw) return null
    const asNumber = Number(raw)
    if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber
    return parseIso8601Duration(raw)
}

/** Parses ISO-8601 durations such as PT1M2S into seconds. */
export function parseIso8601Duration(raw: string): number | null {
    const match = raw.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
    if (!match) return null
    const hours = Number(match[1] ?? 0)
    const minutes = Number(match[2] ?? 0)
    const seconds = Number(match[3] ?? 0)
    return hours * 3600 + minutes * 60 + seconds
}

function entryFromBlock(block: string): YoutubeFeedEntry | null {
    const videoId =
        tag(block, "yt:videoId") ??
        tag(block, "videoId") ??
        block.match(/yt:video:([a-zA-Z0-9_-]{11})/)?.[1] ??
        null
    if (!videoId) return null
    const channelId = tag(block, "yt:channelId") ?? tag(block, "channelId")
    const title = tag(block, "title") ?? "Untitled"
    const url =
        attr(block, "link", "href") ??
        tag(block, "link") ??
        `https://www.youtube.com/watch?v=${videoId}`
    const published = tag(block, "published")
    const durationSeconds = parseDuration(
        attr(block, "media:content", "duration") ?? tag(block, "yt:duration")
    )
    const description = tag(block, "media:description") ?? tag(block, "summary") ?? ""
    return {
        videoId,
        channelId: channelId && /^UC[\w-]{22}$/.test(channelId) ? channelId : null,
        title,
        url,
        published,
        durationSeconds,
        description,
    }
}

/** Parses YouTube Atom/RSS XML (channel feeds and PubSubHubbub pings) into video entries. */
export function parseYoutubeAtomFeed(xml: string): {
    channelTitle: string | null
    entries: YoutubeFeedEntry[]
} {
    const titleMatch = xml.match(/<title>([^<]+)<\/title>/i)
    const channelTitle = titleMatch?.[1] ? decodeXml(titleMatch[1].trim()) : null
    const entries: YoutubeFeedEntry[] = []
    const seen = new Set<string>()
    const re = /<entry\b[\s\S]*?<\/entry>/gi
    let match: RegExpExecArray | null
    while ((match = re.exec(xml))) {
        const entry = entryFromBlock(match[0])
        if (!entry || seen.has(entry.videoId)) continue
        seen.add(entry.videoId)
        entries.push(entry)
    }
    return { channelTitle, entries }
}

/** RSS URL for a canonical YouTube channel id. */
export function youtubeRssUrl(channelId: string): string {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
}

/** PubSubHubbub topic URL YouTube documents for a channel. */
export function youtubePubsubTopic(channelId: string): string {
    return youtubeRssUrl(channelId)
}

/** Extracts UC… from a PubSub topic URL, or null. */
export function youtubeChannelIdFromTopic(topic: string): string | null {
    try {
        const url = new URL(topic)
        const id = url.searchParams.get("channel_id")
        return id && /^UC[\w-]{22}$/.test(id) ? id : null
    } catch {
        return null
    }
}
