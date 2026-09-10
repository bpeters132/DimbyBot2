import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { Client } from "discord.js"
import type { YoutubeAlertEntry, YoutubeWatchEntry } from "../types/index.js"
import {
    initializeYoutubeAlertStore,
    isYoutubeVideoSeen,
    markYoutubeVideosSeen,
    resetYoutubeAlertStoreForTests,
    setYoutubeAlertStoreDbForTests,
} from "./youtubeAlertStore.js"
import { communitySeenId } from "./youtubeCommunityPosts.js"
import {
    isYoutubeWatchSeedComplete,
    pollYoutubeCommunityOnce,
    processYoutubeUploadEvent,
    seedYoutubeWatchBacklog,
    seedYoutubeWatchSeenFromRss,
    shouldMarkFeedFallbackNoMatch,
    shouldMarkUploadSeen,
    YOUTUBE_WATCH_COMMUNITY_SEED_MARKER,
    YOUTUBE_WATCH_SEED_MARKER,
} from "./youtubeUploadMonitor.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

const RSS = `<?xml version="1.0"?>
<feed>
  <entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Old</title></entry>
  <entry><yt:videoId>bbbbbbbbbbb</yt:videoId><title>Older</title></entry>
</feed>`

const COMMUNITY_HTML = `"postId":"UgPostOld111","postId":"UgPostOld222"`

function watchEntry(id = 1): YoutubeWatchEntry {
    return {
        id,
        guildId: "100",
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }
}

function alertEntry(
    overrides: Partial<YoutubeAlertEntry> & Pick<YoutubeAlertEntry, "eventTypes">
): YoutubeAlertEntry {
    return {
        id: 1,
        watchId: 1,
        discordChannelId: "200",
        mentionRoleIds: [],
        messageTemplate: null,
        createdBy: "300",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

function mockTextClient(sends: string[]): Client {
    return {
        channels: {
            fetch: async () => ({
                type: 0,
                id: "200",
                guild: { members: { me: null } },
                permissionsFor: () => null,
                send: async (payload: { content?: string }) => {
                    sends.push(payload.content ?? "")
                    return {}
                },
            }),
        },
    } as unknown as Client
}

afterEach(() => {
    resetYoutubeAlertStoreForTests()
    setYoutubeAlertStoreDbForTests(null)
})

describe("shouldMarkUploadSeen", () => {
    it("marks seen when no Alerts match or every matching Alert posted", () => {
        assert.equal(shouldMarkUploadSeen(0, 0), true)
        assert.equal(shouldMarkUploadSeen(2, 2), true)
        assert.equal(shouldMarkUploadSeen(2, 1), false)
        assert.equal(shouldMarkUploadSeen(1, 0), false)
    })

    it("can refuse to mark on zero-match for uncertain feed classifications", () => {
        assert.equal(shouldMarkUploadSeen(0, 0, false), false)
        assert.equal(shouldMarkUploadSeen(1, 1, false), true)
    })
})

describe("shouldMarkFeedFallbackNoMatch", () => {
    it("refuses no-match mark when live/premiere Alerts would be silenced by a video heuristic", () => {
        assert.equal(shouldMarkFeedFallbackNoMatch([{ eventTypes: ["live"] }], "video"), false)
        assert.equal(
            shouldMarkFeedFallbackNoMatch([{ eventTypes: ["premiere", "video"] }], "short"),
            false
        )
        assert.equal(shouldMarkFeedFallbackNoMatch([{ eventTypes: ["video"] }], "video"), true)
        assert.equal(shouldMarkFeedFallbackNoMatch([{ eventTypes: ["live"] }], "community"), true)
    })
})

describe("seedYoutubeWatchSeenFromRss", () => {
    it("marks current RSS video ids seen so history is not announced", async () => {
        const persisted: string[] = []
        const watch = watchEntry()
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch],
                alerts: [alertEntry({ eventTypes: ["video"] })],
                seenByWatch: {},
                leases: [],
            }),
            addYoutubeSeenVideos: async (_watchId, ids) => {
                persisted.push(...ids)
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const count = await seedYoutubeWatchSeenFromRss(watch, async () => ({
            ok: true,
            status: 200,
            text: RSS,
        }))
        assert.equal(count, 2)
        assert.deepEqual(persisted, ["aaaaaaaaaaa", "bbbbbbbbbbb"])
        assert.equal(isYoutubeVideoSeen(1, "aaaaaaaaaaa"), true)
        assert.equal(isYoutubeVideoSeen(1, "newvideo111"), false)
    })
})

describe("seedYoutubeWatchBacklog", () => {
    it("seeds RSS + community and writes the seed-complete marker", async () => {
        const persisted: string[] = []
        const watch = watchEntry()
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch],
                alerts: [],
                seenByWatch: {},
                leases: [],
            }),
            addYoutubeSeenVideos: async (_watchId, ids) => {
                persisted.push(...ids)
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        assert.equal(isYoutubeWatchSeedComplete(1), false)

        const seeded = await seedYoutubeWatchBacklog(watch, async (url) => {
            if (url.includes("feeds/videos.xml")) {
                return { ok: true, status: 200, text: RSS }
            }
            return { ok: true, status: 200, text: COMMUNITY_HTML }
        })

        assert.equal(seeded.rss, 2)
        assert.equal(seeded.community, 2)
        assert.equal(isYoutubeWatchSeedComplete(1), true)
        assert.equal(isYoutubeVideoSeen(1, YOUTUBE_WATCH_SEED_MARKER), true)
        assert.equal(isYoutubeVideoSeen(1, YOUTUBE_WATCH_COMMUNITY_SEED_MARKER), true)
        assert.equal(isYoutubeVideoSeen(1, communitySeenId("UgPostOld111")), true)
        assert.equal(isYoutubeVideoSeen(1, "aaaaaaaaaaa"), true)
        assert.ok(persisted.includes(YOUTUBE_WATCH_SEED_MARKER))
    })
})

describe("processYoutubeUploadEvent seed gate", () => {
    it("skips delivery until the Watch seed marker exists", async () => {
        const posts: string[] = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watchEntry()],
                alerts: [alertEntry({ eventTypes: ["video"] })],
                seenByWatch: {},
                leases: [],
            }),
            addYoutubeSeenVideos: async () => {},
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })

        const client = mockTextClient(posts)
        const posted = await processYoutubeUploadEvent(
            client,
            {
                videoId: "newvideo111",
                channelId: CHANNEL_ID,
                title: "New",
                url: "https://www.youtube.com/watch?v=newvideo111",
                published: null,
                durationSeconds: 120,
                description: "",
            },
            "video",
            "newvideo111",
            { warn() {}, info() {}, debug() {} }
        )
        assert.equal(posted, 0)
        assert.equal(posts.length, 0)
        assert.equal(isYoutubeVideoSeen(1, "newvideo111"), false)

        await markYoutubeVideosSeen(1, [YOUTUBE_WATCH_SEED_MARKER])
        const postedAfter = await processYoutubeUploadEvent(
            client,
            {
                videoId: "newvideo111",
                channelId: CHANNEL_ID,
                title: "New",
                url: "https://www.youtube.com/watch?v=newvideo111",
                published: null,
                durationSeconds: 120,
                description: "",
            },
            "video",
            "newvideo111",
            { warn() {}, info() {}, debug() {} }
        )
        assert.equal(postedAfter, 1)
        assert.equal(posts.length, 1)
        assert.equal(isYoutubeVideoSeen(1, "newvideo111"), true)
    })

    it("does not mark upcoming-as-video for live-only Alerts on feed-fallback", async () => {
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watchEntry()],
                alerts: [alertEntry({ eventTypes: ["live"] })],
                seenByWatch: { 1: [YOUTUBE_WATCH_SEED_MARKER] },
                leases: [],
            }),
            addYoutubeSeenVideos: async () => {},
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        await processYoutubeUploadEvent(
            mockTextClient([]),
            {
                videoId: "upcoming111",
                channelId: CHANNEL_ID,
                title: "Soon",
                url: "https://www.youtube.com/watch?v=upcoming111",
                published: null,
                durationSeconds: null,
                description: "",
            },
            "video",
            "upcoming111",
            { warn() {}, info() {}, debug() {} },
            { classificationSource: "feed-fallback" }
        )
        assert.equal(isYoutubeVideoSeen(1, "upcoming111"), false)
    })
})

describe("pollYoutubeCommunityOnce", () => {
    it("seeds historical community posts on first successful scrape without announcing", async () => {
        const sends: string[] = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watchEntry()],
                alerts: [alertEntry({ eventTypes: ["community"] })],
                seenByWatch: { 1: [YOUTUBE_WATCH_SEED_MARKER] },
                leases: [],
            }),
            addYoutubeSeenVideos: async () => {},
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const client = mockTextClient(sends)

        await pollYoutubeCommunityOnce(
            client,
            {
                fetchImpl: async () => ({
                    ok: true,
                    status: 200,
                    text: `"postId":"UgOldPostAAA","postId":"UgOldPostBBB"`,
                }),
            },
            { info() {}, warn() {}, debug() {} }
        )

        assert.equal(sends.length, 0)
        assert.equal(isYoutubeVideoSeen(1, YOUTUBE_WATCH_COMMUNITY_SEED_MARKER), true)
        assert.equal(isYoutubeVideoSeen(1, communitySeenId("UgOldPostAAA")), true)

        await pollYoutubeCommunityOnce(
            client,
            {
                fetchImpl: async () => ({
                    ok: true,
                    status: 200,
                    text: `"postId":"UgOldPostAAA","postId":"UgOldPostBBB","postId":"UgNewPostCCC"`,
                }),
            },
            { info() {}, warn() {}, debug() {} }
        )
        assert.equal(sends.length, 1)
        assert.equal(isYoutubeVideoSeen(1, communitySeenId("UgNewPostCCC")), true)
    })
})
