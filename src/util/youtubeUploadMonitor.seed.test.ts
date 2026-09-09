import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { YoutubeAlertEntry, YoutubeWatchEntry } from "../types/index.js"
import {
    initializeYoutubeAlertStore,
    isYoutubeVideoSeen,
    resetYoutubeAlertStoreForTests,
    setYoutubeAlertStoreDbForTests,
} from "./youtubeAlertStore.js"
import { seedYoutubeWatchSeenFromRss, shouldMarkUploadSeen } from "./youtubeUploadMonitor.js"

const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

const RSS = `<?xml version="1.0"?>
<feed>
  <entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Old</title></entry>
  <entry><yt:videoId>bbbbbbbbbbb</yt:videoId><title>Older</title></entry>
</feed>`

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
})

describe("seedYoutubeWatchSeenFromRss", () => {
    it("marks current RSS video ids seen so history is not announced", async () => {
        const persisted: string[] = []
        const watch: YoutubeWatchEntry = {
            id: 1,
            guildId: "100",
            youtubeChannelId: CHANNEL_ID,
            youtubeChannelName: "LTT",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }
        const alert: YoutubeAlertEntry = {
            id: 1,
            watchId: 1,
            discordChannelId: "200",
            mentionRoleIds: [],
            messageTemplate: null,
            eventTypes: ["video"],
            createdBy: "300",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }
        setYoutubeAlertStoreDbForTests({
            getAllYoutubeWatchesFromDatabase: async () => ({
                watches: [watch],
                alerts: [alert],
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
