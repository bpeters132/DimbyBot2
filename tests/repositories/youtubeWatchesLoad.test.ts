import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const CHANNEL_A = "UCXuqSBlHAE6Xw-yeJA0Tunw"
const CHANNEL_B = "UCsXVk37bltHxD1rDPwtNM8Q"
const createdAt = new Date("2026-10-01T00:00:00.000Z")
const seenAt = new Date("2026-10-02T00:00:00.000Z")
const leaseExpiresAt = new Date("2026-10-25T12:00:00.000Z")
const leaseUpdatedAt = new Date("2026-10-24T10:00:00.000Z")

type FindManyThrowKey = "watch" | "alert" | "seen" | "lease" | null

const db = {
    watchFindManyCalls: 0,
    alertFindManyCalls: 0,
    seenFindManyCalls: 0,
    leaseFindManyCalls: 0,
    lastWatchFindManyArgs: undefined as unknown,
    lastAlertFindManyArgs: undefined as unknown,
    lastSeenFindManyArgs: undefined as unknown,
    lastLeaseFindManyArgs: undefined as unknown,
    throwOn: null as FindManyThrowKey,
    watchRows: [] as Record<string, unknown>[],
    alertRows: [] as Record<string, unknown>[],
    seenRows: [] as Record<string, unknown>[],
    leaseRows: [] as Record<string, unknown>[],
}

function resetDb() {
    db.watchFindManyCalls = 0
    db.alertFindManyCalls = 0
    db.seenFindManyCalls = 0
    db.leaseFindManyCalls = 0
    db.lastWatchFindManyArgs = undefined
    db.lastAlertFindManyArgs = undefined
    db.lastSeenFindManyArgs = undefined
    db.lastLeaseFindManyArgs = undefined
    db.throwOn = null
    db.watchRows = []
    db.alertRows = []
    db.seenRows = []
    db.leaseRows = []
}

function findMany(key: Exclude<FindManyThrowKey, null>) {
    return async (args?: unknown) => {
        if (key === "watch") {
            db.watchFindManyCalls += 1
            db.lastWatchFindManyArgs = args
        } else if (key === "alert") {
            db.alertFindManyCalls += 1
            db.lastAlertFindManyArgs = args
        } else if (key === "seen") {
            db.seenFindManyCalls += 1
            db.lastSeenFindManyArgs = args
        } else {
            db.leaseFindManyCalls += 1
            db.lastLeaseFindManyArgs = args
        }
        if (db.throwOn === key) throw new Error("connection lost")
        if (key === "watch") return db.watchRows
        if (key === "alert") return db.alertRows
        if (key === "seen") return db.seenRows
        return db.leaseRows
    }
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            youtubeWatch: { findMany: findMany("watch") },
            youtubeAlert: { findMany: findMany("alert") },
            youtubeSeenVideo: { findMany: findMany("seen") },
            youtubeChannelLease: { findMany: findMany("lease") },
        }),
    },
})

const { getAllYoutubeWatchesFromDatabase } =
    await import("../../src/repositories/youtubeAlertRepository.js")

function seedTwoGuildsSameVideo() {
    db.watchRows.push(
        {
            id: 1,
            guildId: "100",
            youtubeChannelId: CHANNEL_A,
            youtubeChannelName: "LTT",
            createdAt,
            alerts: [{ id: 10 }],
            seenVideos: [{ videoId: "vid-a" }],
        },
        {
            id: 2,
            guildId: "200",
            youtubeChannelId: CHANNEL_A,
            youtubeChannelName: "LTT",
            createdAt,
            alerts: [],
            seenVideos: [],
        }
    )
    const mentionRoleIds = ["123456789012345678"]
    db.alertRows.push({
        id: 10,
        watchId: 1,
        discordChannelId: "300",
        mentionRoleIds,
        messageTemplate: "new upload",
        eventTypes: ["video", "not-a-type", "short"],
        createdBy: "400",
        createdAt,
        watch: { id: 1 },
    })
    db.seenRows.push(
        { watchId: 1, videoId: "vid-a", seenAt },
        { watchId: 1, videoId: "vid-b", seenAt },
        { watchId: 2, videoId: "vid-a", seenAt }
    )
    db.leaseRows.push({
        youtubeChannelId: CHANNEL_A,
        leaseExpiresAt,
        updatedAt: leaseUpdatedAt,
        extraPrismaField: "must-not-leak",
    })
    return { mentionRoleIds }
}

describe("getAllYoutubeWatchesFromDatabase store-init mapping", () => {
    beforeEach(() => {
        resetDb()
    })

    it("groups seen video ids by watchId so two guilds can share a video id", async () => {
        seedTwoGuildsSameVideo()

        const loaded = await getAllYoutubeWatchesFromDatabase()

        assert.deepEqual(loaded.seenByWatch, {
            1: ["vid-a", "vid-b"],
            2: ["vid-a"],
        })
        assert.equal("vid-a" in loaded.seenByWatch, false)
        assert.equal("vid-b" in loaded.seenByWatch, false)
        assert.deepEqual(Object.keys(loaded.seenByWatch).sort(), ["1", "2"])
    })

    it("maps watches, alerts, and leases without Prisma relation extras", async () => {
        const { mentionRoleIds } = seedTwoGuildsSameVideo()

        const loaded = await getAllYoutubeWatchesFromDatabase()

        assert.deepEqual(loaded.watches, [
            {
                id: 1,
                guildId: "100",
                youtubeChannelId: CHANNEL_A,
                youtubeChannelName: "LTT",
                createdAt,
            },
            {
                id: 2,
                guildId: "200",
                youtubeChannelId: CHANNEL_A,
                youtubeChannelName: "LTT",
                createdAt,
            },
        ])
        assert.equal("alerts" in loaded.watches[0], false)
        assert.equal("seenVideos" in loaded.watches[0], false)

        assert.deepEqual(loaded.alerts, [
            {
                id: 10,
                watchId: 1,
                discordChannelId: "300",
                mentionRoleIds: ["123456789012345678"],
                messageTemplate: "new upload",
                eventTypes: ["video", "short"],
                createdBy: "400",
                createdAt,
            },
        ])
        assert.equal("watch" in loaded.alerts[0], false)
        loaded.alerts[0].mentionRoleIds.push("mutated")
        assert.deepEqual(mentionRoleIds, ["123456789012345678"])

        assert.deepEqual(loaded.leases, [
            {
                youtubeChannelId: CHANNEL_A,
                leaseExpiresAt,
                updatedAt: leaseUpdatedAt,
            },
        ])
        assert.equal("extraPrismaField" in loaded.leases[0], false)
    })

    it("loads every table with unfiltered findMany so other guilds are not dropped", async () => {
        seedTwoGuildsSameVideo()
        db.leaseRows.push({
            youtubeChannelId: CHANNEL_B,
            leaseExpiresAt,
            updatedAt: leaseUpdatedAt,
        })

        const loaded = await getAllYoutubeWatchesFromDatabase()

        assert.equal(db.watchFindManyCalls, 1)
        assert.equal(db.alertFindManyCalls, 1)
        assert.equal(db.seenFindManyCalls, 1)
        assert.equal(db.leaseFindManyCalls, 1)
        for (const args of [
            db.lastWatchFindManyArgs,
            db.lastAlertFindManyArgs,
            db.lastSeenFindManyArgs,
            db.lastLeaseFindManyArgs,
        ]) {
            if (args !== undefined && args !== null) {
                assert.equal(typeof args, "object")
                assert.equal("where" in (args as object), false)
            }
        }
        assert.equal(loaded.watches.length, 2)
        assert.equal(loaded.leases.length, 2)
        assert.deepEqual(
            loaded.leases.map((row) => row.youtubeChannelId).sort(),
            [CHANNEL_A, CHANNEL_B].sort()
        )
    })

    it("returns empty collections when every table is empty", async () => {
        const loaded = await getAllYoutubeWatchesFromDatabase()

        assert.deepEqual(loaded, {
            watches: [],
            alerts: [],
            seenByWatch: {},
            leases: [],
        })
    })

    it("rethrows when any of the four findMany calls fail so store init cannot start empty", async () => {
        for (const key of ["watch", "alert", "seen", "lease"] as const) {
            resetDb()
            seedTwoGuildsSameVideo()
            db.throwOn = key
            await assert.rejects(() => getAllYoutubeWatchesFromDatabase(), /connection lost/)
        }
    })
})
