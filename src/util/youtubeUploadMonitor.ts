import type { Client } from "discord.js"
import type { LoggerInterface, UploadEventType, YoutubeWatchEntry } from "../types/index.js"
import { matchYoutubeAlerts } from "./youtubeAlertMatch.js"
import { postYoutubeAlert } from "./youtubeAlertPoster.js"
import { communitySeenId, fetchYoutubeCommunityPosts } from "./youtubeCommunityPosts.js"
import { defaultYoutubeFetch, type YoutubeFetch } from "./youtubeChannelResolve.js"
import { parseYoutubeAtomFeed, youtubeRssUrl, type YoutubeFeedEntry } from "./youtubeFeedParse.js"
import {
    defaultYoutubePubsubLeaseMs,
    requestYoutubePubsub,
    youtubePubsubCallbackUrlFromEnv,
    youtubePubsubHubSecretFromEnv,
} from "./youtubePubsub.js"
import {
    classifyFromFeedEntry,
    classifyUploadEvent,
    fetchYoutubeVideoDetails,
    youtubeDataApiKeyFromEnv,
} from "./youtubeUploadClassify.js"
import {
    dropYoutubeChannelLease,
    getAllYoutubeWatches,
    getUniqueYoutubeChannelIds,
    getYoutubeAlertsForWatch,
    getYoutubeChannelIdsNeedingLeaseRenew,
    getYoutubeWatchesForChannel,
    isYoutubeVideoSeen,
    markYoutubeVideosSeen,
    saveYoutubeChannelLease,
} from "./youtubeAlertStore.js"
import { loggerFromPartial } from "./loggerFromPartial.js"

export const YOUTUBE_RSS_POLL_MS = 5 * 60 * 1000
export const YOUTUBE_COMMUNITY_POLL_MS = 15 * 60 * 1000
export const YOUTUBE_PUBSUB_RENEW_MS = 60 * 60 * 1000
const LEASE_RENEW_BEFORE_MS = 48 * 60 * 60 * 1000

/**
 * Sentinel seen-id written after RSS (+ community) seed finishes.
 * Watches without this marker must not announce — otherwise PubSub/RSS can race an empty
 * seen set right after create, or a crash mid-seed would spam the backlog on restart.
 */
export const YOUTUBE_WATCH_SEED_MARKER = "__yt_alert_seed_v1__"

/** Separate marker so a failed community scrape during Watch create cannot later spam history. */
export const YOUTUBE_WATCH_COMMUNITY_SEED_MARKER = "__yt_alert_community_seed_v1__"

let rssTimer: ReturnType<typeof setInterval> | null = null
let communityTimer: ReturnType<typeof setInterval> | null = null
let leaseTimer: ReturnType<typeof setInterval> | null = null
let pollChain: Promise<void> = Promise.resolve()

export type YoutubeUploadMonitorDeps = {
    fetchImpl?: YoutubeFetch
    now?: () => Date
}

function withPollLock(work: () => Promise<void>): Promise<void> {
    const run = pollChain.then(work, work)
    pollChain = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

/** True when this Watch finished its initial backlog seed. */
export function isYoutubeWatchSeedComplete(watchId: number): boolean {
    return isYoutubeVideoSeen(watchId, YOUTUBE_WATCH_SEED_MARKER)
}

/** Seeds seen IDs from the current RSS snapshot so existing videos are not announced. */
export async function seedYoutubeWatchSeenFromRss(
    watch: YoutubeWatchEntry,
    fetchImpl: YoutubeFetch = defaultYoutubeFetch
): Promise<number> {
    const res = await fetchImpl(youtubeRssUrl(watch.youtubeChannelId))
    if (!res.ok) {
        throw new Error(`YouTube RSS HTTP ${res.status} for ${watch.youtubeChannelId}`)
    }
    const { entries } = parseYoutubeAtomFeed(res.text)
    const ids = entries.map((entry) => entry.videoId)
    await markYoutubeVideosSeen(watch.id, ids)
    return ids.length
}

/**
 * Seeds seen IDs from the current community/posts snapshot so historical posts are not announced.
 * Returns null when the scrape yields no posts (failure and empty channel look the same) so callers
 * can avoid treating that as a completed community seed.
 */
export async function seedYoutubeWatchSeenFromCommunity(
    watch: YoutubeWatchEntry,
    fetchImpl: YoutubeFetch = defaultYoutubeFetch
): Promise<number | null> {
    const posts = await fetchYoutubeCommunityPosts(watch.youtubeChannelId, fetchImpl)
    if (posts.length === 0) return null
    const ids = [
        ...posts.map((post) => communitySeenId(post.postId)),
        YOUTUBE_WATCH_COMMUNITY_SEED_MARKER,
    ]
    await markYoutubeVideosSeen(watch.id, ids)
    return posts.length
}

/**
 * Snapshots RSS backlog and writes {@link YOUTUBE_WATCH_SEED_MARKER}.
 * Also best-effort community seed. Until the RSS marker is written, delivery skips the Watch.
 */
export async function seedYoutubeWatchBacklog(
    watch: YoutubeWatchEntry,
    fetchImpl: YoutubeFetch = defaultYoutubeFetch
): Promise<{ rss: number; community: number }> {
    const rss = await seedYoutubeWatchSeenFromRss(watch, fetchImpl)
    let community = 0
    try {
        const seeded = await seedYoutubeWatchSeenFromCommunity(watch, fetchImpl)
        community = seeded ?? 0
    } catch {
        // Community scrape is best-effort; first successful community poll will seed instead.
    }
    await markYoutubeVideosSeen(watch.id, [YOUTUBE_WATCH_SEED_MARKER])
    return { rss, community }
}

/** Re-seeds any Watch missing the seed marker (crash mid-seed / legacy rows). */
export async function ensureYoutubeWatchesSeeded(
    fetchImpl: YoutubeFetch = defaultYoutubeFetch,
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    for (const watch of getAllYoutubeWatches()) {
        if (isYoutubeWatchSeedComplete(watch.id)) continue
        try {
            const seeded = await seedYoutubeWatchBacklog(watch, fetchImpl)
            logger.info(
                `[yt-alerts] Completed backlog seed for Watch #${watch.id} (rss=${seeded.rss}, community=${seeded.community}).`
            )
        } catch (error: unknown) {
            logger.warn(`[yt-alerts] Backlog seed failed for Watch #${watch.id}:`, error)
        }
    }
}

/** Subscribe PubSub for a channel when a public callback URL is configured. */
export async function subscribeYoutubeChannelPubsub(
    channelId: string,
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    const callbackUrl = youtubePubsubCallbackUrlFromEnv()
    const result = await requestYoutubePubsub("subscribe", channelId, {
        callbackUrl,
        secret: youtubePubsubHubSecretFromEnv(),
    })
    if ("skipped" in result) {
        logger.debug(
            `[yt-alerts] PubSub skipped for ${channelId} (no YOUTUBE_PUBSUB_CALLBACK_URL).`
        )
        return
    }
    if (!result.ok) {
        logger.warn(`[yt-alerts] PubSub subscribe failed for ${channelId}: HTTP ${result.status}`)
        return
    }
    await saveYoutubeChannelLease(channelId, new Date(Date.now() + defaultYoutubePubsubLeaseMs()))
    logger.info(`[yt-alerts] PubSub subscribed for ${channelId}`)
}

/** Unsubscribe PubSub when no guild still watches the channel. */
export async function unsubscribeYoutubeChannelPubsub(
    channelId: string,
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    const stillWatched = getYoutubeWatchesForChannel(channelId).length > 0
    if (stillWatched) return
    const result = await requestYoutubePubsub("unsubscribe", channelId, {
        callbackUrl: youtubePubsubCallbackUrlFromEnv(),
        secret: youtubePubsubHubSecretFromEnv(),
    })
    await dropYoutubeChannelLease(channelId)
    if ("skipped" in result) return
    if (!result.ok) {
        logger.warn(`[yt-alerts] PubSub unsubscribe failed for ${channelId}: HTTP ${result.status}`)
        return
    }
    logger.info(`[yt-alerts] PubSub unsubscribed for ${channelId}`)
}

async function classifyEntry(
    entry: YoutubeFeedEntry,
    fetchImpl: YoutubeFetch
): Promise<{ eventType: UploadEventType | null; source: "api" | "feed-fallback" }> {
    const apiKey = youtubeDataApiKeyFromEnv()
    if (apiKey) {
        try {
            const details = await fetchYoutubeVideoDetails(entry.videoId, apiKey, async (url) => {
                const res = await fetchImpl(url)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return JSON.parse(res.text) as unknown
            })
            if (details) {
                return {
                    eventType: classifyUploadEvent({
                        ...details,
                        title: details.title ?? entry.title,
                        description: details.description ?? entry.description,
                        url: details.url ?? entry.url,
                        durationSeconds: details.durationSeconds ?? entry.durationSeconds,
                    }),
                    source: "api",
                }
            }
        } catch {
            // Fall through to feed heuristics.
        }
    }
    return { eventType: classifyFromFeedEntry(entry), source: "feed-fallback" }
}

/**
 * True when the Watch should record this id so we do not retry (no Alerts, or every Alert posted).
 * When `markWhenNoMatch` is false, a zero-match classification is left unseen (feed heuristics can
 * mislabel upcoming lives/premieres as video/short).
 */
export function shouldMarkUploadSeen(
    matchingAlertCount: number,
    postedCount: number,
    markWhenNoMatch = true
): boolean {
    if (matchingAlertCount === 0) return markWhenNoMatch
    return postedCount === matchingAlertCount
}

/**
 * Feed-only classification hardcodes liveBroadcastContent to "none". If this Watch still cares
 * about live/premiere, a video/short no-match must not permanently silence the id.
 */
export function shouldMarkFeedFallbackNoMatch(
    watchAlerts: { eventTypes: UploadEventType[] }[],
    eventType: UploadEventType
): boolean {
    if (eventType !== "video" && eventType !== "short") return true
    const caresAboutLiveOrPremiere = watchAlerts.some(
        (alert) => alert.eventTypes.includes("live") || alert.eventTypes.includes("premiere")
    )
    return !caresAboutLiveOrPremiere
}

/**
 * Delivers a classified event to every matching Alert on every Watch for the channel.
 * Marks the id seen only when every matching Alert posted (or none matched). Upcoming events
 * are left unseen. Unseeded Watches are skipped.
 */
export async function processYoutubeUploadEvent(
    client: Client,
    entry: YoutubeFeedEntry,
    eventType: UploadEventType,
    seenId: string,
    loggerInstance?: Partial<LoggerInterface>,
    options: { classificationSource?: "api" | "feed-fallback" } = {}
): Promise<number> {
    const logger = loggerFromPartial(loggerInstance)
    const channelId = entry.channelId
    if (!channelId) return 0
    let posted = 0
    for (const watch of getYoutubeWatchesForChannel(channelId)) {
        if (!isYoutubeWatchSeedComplete(watch.id)) continue
        if (isYoutubeVideoSeen(watch.id, seenId)) continue
        const watchAlerts = getYoutubeAlertsForWatch(watch.id)
        const alerts = matchYoutubeAlerts(watchAlerts, eventType)
        let postedForWatch = 0
        for (const alert of alerts) {
            const ok = await postYoutubeAlert(
                client,
                watch,
                alert,
                {
                    title: entry.title,
                    url: entry.url,
                    type: eventType,
                },
                logger
            )
            if (ok) {
                posted += 1
                postedForWatch += 1
            }
        }
        const markWhenNoMatch =
            options.classificationSource !== "feed-fallback" ||
            shouldMarkFeedFallbackNoMatch(watchAlerts, eventType)
        if (shouldMarkUploadSeen(alerts.length, postedForWatch, markWhenNoMatch)) {
            await markYoutubeVideosSeen(watch.id, [seenId])
        }
    }
    return posted
}

/** Processes feed entries for one YouTube channel (RSS or PubSub). */
export async function processYoutubeFeedEntries(
    client: Client,
    channelId: string,
    entries: YoutubeFeedEntry[],
    fetchImpl: YoutubeFetch = defaultYoutubeFetch,
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    for (const raw of entries) {
        const entry = { ...raw, channelId: raw.channelId ?? channelId }
        const watches = getYoutubeWatchesForChannel(entry.channelId).filter((watch) =>
            isYoutubeWatchSeedComplete(watch.id)
        )
        if (watches.length === 0) continue
        if (watches.every((watch) => isYoutubeVideoSeen(watch.id, entry.videoId))) continue
        let classified: { eventType: UploadEventType | null; source: "api" | "feed-fallback" }
        try {
            classified = await classifyEntry(entry, fetchImpl)
        } catch (error: unknown) {
            logger.warn(`[yt-alerts] Failed to classify ${entry.videoId}:`, error)
            classified = {
                eventType: classifyFromFeedEntry(entry),
                source: "feed-fallback",
            }
        }
        if (!classified.eventType) continue
        await processYoutubeUploadEvent(
            client,
            entry,
            classified.eventType,
            entry.videoId,
            logger,
            { classificationSource: classified.source }
        )
    }
}

/** Polls RSS once for every unique watched YouTube channel. */
export async function pollYoutubeRssOnce(
    client: Client,
    deps: YoutubeUploadMonitorDeps = {},
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    const fetchImpl = deps.fetchImpl ?? defaultYoutubeFetch
    const channelIds = getUniqueYoutubeChannelIds()
    for (const channelId of channelIds) {
        try {
            const res = await fetchImpl(youtubeRssUrl(channelId))
            if (!res.ok) {
                logger.warn(`[yt-alerts] RSS HTTP ${res.status} for ${channelId}`)
                continue
            }
            const { entries } = parseYoutubeAtomFeed(res.text)
            await processYoutubeFeedEntries(client, channelId, entries, fetchImpl, logger)
        } catch (error: unknown) {
            logger.warn(`[yt-alerts] RSS poll failed for ${channelId}:`, error)
        }
    }
}

/** Best-effort community poll for channels that have a community Alert. */
export async function pollYoutubeCommunityOnce(
    client: Client,
    deps: YoutubeUploadMonitorDeps = {},
    loggerInstance?: Partial<LoggerInterface>
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    const fetchImpl = deps.fetchImpl ?? defaultYoutubeFetch
    const channelIds = new Set<string>()
    for (const channelId of getUniqueYoutubeChannelIds()) {
        const watches = getYoutubeWatchesForChannel(channelId)
        const wantsCommunity = watches.some((watch) =>
            getYoutubeAlertsForWatch(watch.id).some((alert) =>
                alert.eventTypes.includes("community")
            )
        )
        if (wantsCommunity) channelIds.add(channelId)
    }
    for (const channelId of channelIds) {
        try {
            const posts = await fetchYoutubeCommunityPosts(channelId, fetchImpl)
            if (posts.length === 0) continue
            for (const watch of getYoutubeWatchesForChannel(channelId)) {
                if (!isYoutubeWatchSeedComplete(watch.id)) continue
                const wantsCommunity = getYoutubeAlertsForWatch(watch.id).some((alert) =>
                    alert.eventTypes.includes("community")
                )
                if (!wantsCommunity) continue
                if (!isYoutubeVideoSeen(watch.id, YOUTUBE_WATCH_COMMUNITY_SEED_MARKER)) {
                    await markYoutubeVideosSeen(watch.id, [
                        ...posts.map((post) => communitySeenId(post.postId)),
                        YOUTUBE_WATCH_COMMUNITY_SEED_MARKER,
                    ])
                    logger.info(
                        `[yt-alerts] Seeded ${posts.length} community post(s) for Watch #${watch.id} (no announce).`
                    )
                    continue
                }
            }
            for (const post of posts) {
                const entry: YoutubeFeedEntry = {
                    videoId: post.postId,
                    channelId,
                    title: post.title,
                    url: post.url,
                    published: null,
                    durationSeconds: null,
                    description: "",
                }
                await processYoutubeUploadEvent(
                    client,
                    entry,
                    "community",
                    communitySeenId(post.postId),
                    logger
                )
            }
        } catch (error: unknown) {
            logger.warn(`[yt-alerts] Community poll failed for ${channelId}:`, error)
        }
    }
}

/** Renews PubSub leases that are missing or expire within 48 hours. */
export async function renewYoutubePubsubLeases(
    loggerInstance?: Partial<LoggerInterface>,
    now: () => Date = () => new Date()
): Promise<void> {
    const logger = loggerFromPartial(loggerInstance)
    if (!youtubePubsubCallbackUrlFromEnv()) return
    const due = getYoutubeChannelIdsNeedingLeaseRenew(
        new Date(now().getTime() + LEASE_RENEW_BEFORE_MS)
    )
    for (const channelId of due) {
        await subscribeYoutubeChannelPubsub(channelId, logger)
    }
}

/** Starts RSS, community, and PubSub lease timers. Safe to call once after Discord is ready. */
export function startYoutubeUploadMonitor(
    client: Client,
    loggerInstance?: Partial<LoggerInterface>
): void {
    const logger = loggerFromPartial(loggerInstance)
    stopYoutubeUploadMonitor()
    const runRss = () =>
        withPollLock(async () => {
            await ensureYoutubeWatchesSeeded(defaultYoutubeFetch, logger)
            await pollYoutubeRssOnce(client, {}, logger)
        }).catch((error: unknown) => logger.warn("[yt-alerts] RSS poll cycle failed:", error))
    const runCommunity = () =>
        withPollLock(() => pollYoutubeCommunityOnce(client, {}, logger)).catch((error: unknown) =>
            logger.warn("[yt-alerts] Community poll cycle failed:", error)
        )
    const runLeases = () =>
        renewYoutubePubsubLeases(logger).catch((error: unknown) =>
            logger.warn("[yt-alerts] PubSub renew failed:", error)
        )
    void runRss()
    void runLeases()
    rssTimer = setInterval(runRss, YOUTUBE_RSS_POLL_MS)
    communityTimer = setInterval(runCommunity, YOUTUBE_COMMUNITY_POLL_MS)
    leaseTimer = setInterval(runLeases, YOUTUBE_PUBSUB_RENEW_MS)
    if (rssTimer && typeof rssTimer === "object" && "unref" in rssTimer) rssTimer.unref()
    if (communityTimer && typeof communityTimer === "object" && "unref" in communityTimer) {
        communityTimer.unref()
    }
    if (leaseTimer && typeof leaseTimer === "object" && "unref" in leaseTimer) leaseTimer.unref()
    logger.info(
        "[yt-alerts] Upload Alert monitor started (RSS 5m, community 15m, PubSub renew 1h)."
    )
}

/** Clears monitor timers (tests / shutdown). */
export function stopYoutubeUploadMonitor(): void {
    if (rssTimer) clearInterval(rssTimer)
    if (communityTimer) clearInterval(communityTimer)
    if (leaseTimer) clearInterval(leaseTimer)
    rssTimer = null
    communityTimer = null
    leaseTimer = null
    pollChain = Promise.resolve()
}
