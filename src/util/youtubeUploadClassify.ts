import type { UploadEventType } from "../types/index.js"
import { parseIso8601Duration, type YoutubeFeedEntry } from "./youtubeFeedParse.js"

export type YoutubeVideoDetails = {
    title?: string
    description?: string
    url?: string
    durationSeconds?: number | null
    liveBroadcastContent?: "none" | "upcoming" | "live" | string
}

/**
 * Classifies a YouTube item into an Upload event type.
 * Upcoming livestreams/premieres return null so we do not mark them seen until they are watchable.
 */
export function classifyUploadEvent(details: YoutubeVideoDetails): UploadEventType | null {
    const live = (details.liveBroadcastContent ?? "none").toLowerCase()
    if (live === "upcoming") return null
    const title = details.title ?? ""
    const description = details.description ?? ""
    const url = details.url ?? ""
    const duration = details.durationSeconds
    const looksShort =
        /#shorts?\b/i.test(title) ||
        /#shorts?\b/i.test(description) ||
        /youtube\.com\/shorts\//i.test(url)

    if (live === "live") {
        if (looksShort) return "short"
        return "live"
    }

    if (looksShort || (duration != null && duration > 0 && duration <= 60)) return "short"
    return "video"
}

/** Builds classification input from an RSS/Atom entry (no Data API). */
export function classifyFromFeedEntry(entry: YoutubeFeedEntry): UploadEventType | null {
    return classifyUploadEvent({
        title: entry.title,
        description: entry.description,
        url: entry.url,
        durationSeconds: entry.durationSeconds,
        liveBroadcastContent: "none",
    })
}

type YoutubeFetchJson = (url: string) => Promise<unknown>

/**
 * Fetches `videos.list` when a Data API key is set. Returns null on failure so callers can
 * fall back to feed heuristics. This is a server API key, not YouTube OAuth.
 */
export async function fetchYoutubeVideoDetails(
    videoId: string,
    apiKey: string,
    fetchJson: YoutubeFetchJson = defaultFetchJson
): Promise<YoutubeVideoDetails | null> {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos")
    url.searchParams.set("part", "snippet,contentDetails,liveStreamingDetails")
    url.searchParams.set("id", videoId)
    url.searchParams.set("key", apiKey)
    try {
        const body = (await fetchJson(url.toString())) as {
            items?: {
                snippet?: {
                    title?: string
                    description?: string
                    liveBroadcastContent?: string
                }
                contentDetails?: { duration?: string }
            }[]
        }
        const item = body.items?.[0]
        if (!item) return null
        const durationRaw = item.contentDetails?.duration
        return {
            title: item.snippet?.title,
            description: item.snippet?.description,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            durationSeconds: durationRaw ? parseIso8601Duration(durationRaw) : null,
            liveBroadcastContent: item.snippet?.liveBroadcastContent ?? "none",
        }
    } catch {
        return null
    }
}

async function defaultFetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`YouTube Data API HTTP ${res.status}`)
    return res.json()
}

/** Optional Data API key from env; empty/unset means heuristics only. */
export function youtubeDataApiKeyFromEnv(env: NodeJS.Dict<string> = process.env): string | null {
    const key = env.YOUTUBE_DATA_API_KEY?.trim()
    return key || null
}
