import assert from "node:assert/strict"
import { ChannelType, type Client } from "discord.js"
import { afterEach, describe, it } from "node:test"
import type { YoutubeAlertEntry, YoutubeWatchEntry } from "../types/index.js"
import {
    initializeYoutubeAlertStore,
    isYoutubeVideoSeen,
    resetYoutubeAlertStoreForTests,
    setYoutubeAlertStoreDbForTests,
} from "./youtubeAlertStore.js"
import { processYoutubeUploadEvent } from "./youtubeUploadMonitor.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"
const VIDEO_ID = "dQw4w9WgXcQ"

function watch(overrides: Partial<YoutubeWatchEntry> = {}): YoutubeWatchEntry {
    return {
        id: 1,
        guildId: "100",
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

function alert(overrides: Partial<YoutubeAlertEntry> = {}): YoutubeAlertEntry {
    return {
        id: 1,
        watchId: 1,
        discordChannelId: "200",
        mentionRoleIds: [],
        messageTemplate: null,
        eventTypes: ["video"],
        createdBy: "300",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
    }
}

function entry() {
    return {
        videoId: VIDEO_ID,
        channelId: CHANNEL_ID,
        title: "New upload",
        url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
        published: "2026-09-01T12:00:00+00:00",
        durationSeconds: 120,
        description: "",
    }
}

type MockClientOptions = {
    /** Channel ids that fetch as missing → post returns false. */
    missingChannelIds?: ReadonlySet<string>
    /** Channel ids whose send throws → post returns false. */
    failSendChannelIds?: ReadonlySet<string>
}

function mockClient(options: MockClientOptions = {}): {
    client: Client
    sentChannelIds: string[]
} {
    const sentChannelIds: string[] = []
    const client = {
        channels: {
            fetch: async (id: string) => {
                if (options.missingChannelIds?.has(id)) return null
                return {
                    type: ChannelType.GuildText,
                    id,
                    guild: { members: { me: null } },
                    async send() {
                        if (options.failSendChannelIds?.has(id)) {
                            throw new Error("send failed")
                        }
                        sentChannelIds.push(id)
                    },
                }
            },
        },
    } as unknown as Client
    return { client, sentChannelIds }
}

afterEach(() => {
    resetYoutubeAlertStoreForTests()
    setYoutubeAlertStoreDbForTests(null)
})

describe("processYoutubeUploadEvent", () => {
    it("marks seen without posting when no Alert matches the event type", async () => {
        const seenWrites: Array<{ watchId: number; ids: string[] }> = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch()],
                alerts: [alert({ eventTypes: ["short"] })],
                seenByWatch: {},
                leases: [],
            }),
            addYoutubeSeenVideos: async (watchId, ids) => {
                seenWrites.push({ watchId, ids: [...ids] })
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const { client, sentChannelIds } = mockClient()

        const posted = await processYoutubeUploadEvent(client, entry(), "video", VIDEO_ID, {
            warn() {},
        })

        assert.equal(posted, 0)
        assert.deepEqual(sentChannelIds, [])
        assert.deepEqual(seenWrites, [{ watchId: 1, ids: [VIDEO_ID] }])
        assert.equal(isYoutubeVideoSeen(1, VIDEO_ID), true)
    })

    it("posts every matching Alert and marks seen when all succeed", async () => {
        const seenWrites: Array<{ watchId: number; ids: string[] }> = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch()],
                alerts: [
                    alert({ id: 1, discordChannelId: "200", eventTypes: ["video"] }),
                    alert({ id: 2, discordChannelId: "201", eventTypes: ["video", "short"] }),
                ],
                seenByWatch: {},
                leases: [],
            }),
            addYoutubeSeenVideos: async (watchId, ids) => {
                seenWrites.push({ watchId, ids: [...ids] })
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const { client, sentChannelIds } = mockClient()

        const posted = await processYoutubeUploadEvent(client, entry(), "video", VIDEO_ID, {
            warn() {},
        })

        assert.equal(posted, 2)
        assert.deepEqual(sentChannelIds.sort(), ["200", "201"])
        assert.deepEqual(seenWrites, [{ watchId: 1, ids: [VIDEO_ID] }])
        assert.equal(isYoutubeVideoSeen(1, VIDEO_ID), true)
    })

    it("leaves unseen when a matching Alert fails to post so delivery can retry", async () => {
        const seenWrites: Array<{ watchId: number; ids: string[] }> = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch()],
                alerts: [
                    alert({ id: 1, discordChannelId: "200", eventTypes: ["video"] }),
                    alert({ id: 2, discordChannelId: "201", eventTypes: ["video"] }),
                ],
                seenByWatch: {},
                leases: [],
            }),
            addYoutubeSeenVideos: async (watchId, ids) => {
                seenWrites.push({ watchId, ids: [...ids] })
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const { client, sentChannelIds } = mockClient({
            missingChannelIds: new Set(["201"]),
        })

        const posted = await processYoutubeUploadEvent(client, entry(), "video", VIDEO_ID, {
            warn() {},
        })

        assert.equal(posted, 1)
        assert.deepEqual(sentChannelIds, ["200"])
        assert.deepEqual(seenWrites, [])
        assert.equal(isYoutubeVideoSeen(1, VIDEO_ID), false)
    })

    it("skips an already-seen id without posting or rewriting seen", async () => {
        const seenWrites: Array<{ watchId: number; ids: string[] }> = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch()],
                alerts: [alert()],
                seenByWatch: { 1: [VIDEO_ID] },
                leases: [],
            }),
            addYoutubeSeenVideos: async (watchId, ids) => {
                seenWrites.push({ watchId, ids: [...ids] })
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const { client, sentChannelIds } = mockClient()

        const posted = await processYoutubeUploadEvent(client, entry(), "video", VIDEO_ID, {
            warn() {},
        })

        assert.equal(posted, 0)
        assert.deepEqual(sentChannelIds, [])
        assert.deepEqual(seenWrites, [])
    })

    it("treats each Watch independently for seen marking", async () => {
        const seenWrites: Array<{ watchId: number; ids: string[] }> = []
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch({ id: 1, guildId: "100" }), watch({ id: 2, guildId: "101" })],
                alerts: [
                    alert({ id: 1, watchId: 1, discordChannelId: "200" }),
                    alert({ id: 2, watchId: 2, discordChannelId: "201" }),
                ],
                seenByWatch: {},
                leases: [],
            }),
            addYoutubeSeenVideos: async (watchId, ids) => {
                seenWrites.push({ watchId, ids: [...ids] })
            },
        })
        await initializeYoutubeAlertStore({ info() {}, error() {} })
        const { client, sentChannelIds } = mockClient({
            failSendChannelIds: new Set(["201"]),
        })

        const posted = await processYoutubeUploadEvent(client, entry(), "video", VIDEO_ID, {
            warn() {},
        })

        assert.equal(posted, 1)
        assert.deepEqual(sentChannelIds, ["200"])
        assert.deepEqual(seenWrites, [{ watchId: 1, ids: [VIDEO_ID] }])
        assert.equal(isYoutubeVideoSeen(1, VIDEO_ID), true)
        assert.equal(isYoutubeVideoSeen(2, VIDEO_ID), false)
    })
})
