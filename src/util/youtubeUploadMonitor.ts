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

let rssTimer: ReturnType<typeof setInterval> | null = null
let communityTimer: ReturnType<typeof setInterval> | null = null
let leaseTimer: ReturnType<typeof setInterval> | null = null
let pollChain: Promise<void> = Promise.resolve()

export type YoutubeUploadMonitorDeps = {
    fetchImpl?: YoutubeFetch
    now?: () => Date
}

/**
 * Serializes RSS, community, and PubSub delivery so concurrent notify + poll
 * cannot both announce the same unseen id.
 */
export function withYoutubeUploadPollLock(work: () => Promise<void>): Promise<void> {
    const run = pollChain.then(work, work)
    pollChain = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

/** Seen-store key for a successful Discord delivery of one Alert (retry-safe). */
export function youtubeAlertDeliverySeenId(seenId: string, alertId: number): string {
    return `${seenId}::alert:${alertId}`
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
): Promise<UploadEventType | null> {
    const apiKey = youtubeDataApiKeyFromEnv()
    if (apiKey) {
        const details = await fetchYoutubeVideoDetails(entry.videoId, apiKey, async (url) => {
            const res = await fetchImpl(url)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return JSON.parse(res.text) as unknown
        })
        if (details) {
            return classifyUploadEvent({
                ...details,
                title: details.title ?? entry.title,
                description: details.description ?? entry.description,
                url: details.url ?? entry.url,
                durationSeconds: details.durationSeconds ?? entry.durationSeconds,
            })
        }
    }
    return classifyFromFeedEntry(entry)
}

/** True when the Watch should record this id so we do not retry (no Alerts, or every Alert posted). */
export function shouldMarkUploadSeen(matchingAlertCount: number, postedCount: number): boolean {
    return matchingAlertCount === 0 || postedCount === matchingAlertCount
}

/**
 * Delivers a classified event to every matching Alert on every Watch for the channel.
 * Successful Alert deliveries are recorded immediately (`::alert:` seen keys) so retries
 * do not re-ping healthy channels. The Watch-level id is marked only when every matching
 * Alert has posted (or none matched). Upcoming events are left unseen.
 */
export async function processYoutubeUploadEvent(
    client: Client,
    entry: YoutubeFeedEntry,
    eventType: UploadEventType,
    seenId: string,
    loggerInstance?: Partial<LoggerInterface>
): Promise<number> {
    const logger = loggerFromPartial(loggerInstance)
    const channelId = entry.channelId
    if (!channelId) return 0
    let posted = 0
    for (const watch of getYoutubeWatchesForChannel(channelId)) {
        if (isYoutubeVideoSeen(watch.id, seenId)) continue
        const alerts = matchYoutubeAlerts(getYoutubeAlertsForWatch(watch.id), eventType)
        let postedForWatch = 0
        for (const alert of alerts) {
            const deliverySeenId = youtubeAlertDeliverySeenId(seenId, alert.id)
            if (isYoutubeVideoSeen(watch.id, deliverySeenId)) {
                postedForWatch += 1
                continue
            }
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
                await markYoutubeVideosSeen(watch.id, [deliverySeenId])
            }
        }
        if (shouldMarkUploadSeen(alerts.length, postedForWatch)) {
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
        const watches = getYoutubeWatchesForChannel(entry.channelId)
        if (watches.length === 0) continue
        if (watches.every((watch) => isYoutubeVideoSeen(watch.id, entry.videoId))) continue
        let eventType: UploadEventType | null
        try {
            eventType = await classifyEntry(entry, fetchImpl)
        } catch (error: unknown) {
            logger.warn(`[yt-alerts] Failed to classify ${entry.videoId}:`, error)
            eventType = classifyFromFeedEntry(entry)
        }
        if (!eventType) continue
        await processYoutubeUploadEvent(client, entry, eventType, entry.videoId, logger)
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
        withYoutubeUploadPollLock(() => pollYoutubeRssOnce(client, {}, logger)).catch(
            (error: unknown) => logger.warn("[yt-alerts] RSS poll cycle failed:", error)
        )
    const runCommunity = () =>
        withYoutubeUploadPollLock(() => pollYoutubeCommunityOnce(client, {}, logger)).catch(
            (error: unknown) => logger.warn("[yt-alerts] Community poll cycle failed:", error)
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
