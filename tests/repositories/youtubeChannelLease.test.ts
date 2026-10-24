import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const VALID_CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"
const expiresAt = new Date("2026-10-24T12:00:00.000Z")
const updatedAt = new Date("2026-10-24T10:00:00.000Z")

const INVALID_CHANNEL_IDS = [
    "",
    "   ",
    "UCshort",
    "UCxxxxxxxxxxxxxxxxxxxxxx!",
    "UUXuqSBlHAE6Xw-yeJA0Tunw",
    "@somehandle",
    "https://www.youtube.com/channel/" + VALID_CHANNEL_ID,
]

type UpsertArgs = {
    where: { youtubeChannelId: string }
    create: { youtubeChannelId: string; leaseExpiresAt: Date }
    update: { leaseExpiresAt: Date }
}

const db = {
    upsertCalls: 0,
    lastUpsertArgs: null as UpsertArgs | null,
    upsertThrows: false,
    deleteManyCalls: 0,
    lastDeleteManyArgs: null as { where: { youtubeChannelId: string } } | null,
    deleteManyThrows: false,
}

function resetDb() {
    db.upsertCalls = 0
    db.lastUpsertArgs = null
    db.upsertThrows = false
    db.deleteManyCalls = 0
    db.lastDeleteManyArgs = null
    db.deleteManyThrows = false
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            youtubeChannelLease: {
                upsert: async (args: UpsertArgs) => {
                    db.upsertCalls += 1
                    db.lastUpsertArgs = args
                    if (db.upsertThrows) throw new Error("connection lost")
                    return {
                        youtubeChannelId: args.create.youtubeChannelId,
                        leaseExpiresAt: args.create.leaseExpiresAt,
                        updatedAt,
                    }
                },
                deleteMany: async (args: { where: { youtubeChannelId: string } }) => {
                    db.deleteManyCalls += 1
                    db.lastDeleteManyArgs = args
                    if (db.deleteManyThrows) throw new Error("connection lost")
                    return { count: 1 }
                },
            },
        }),
    },
})

const { deleteYoutubeChannelLease, upsertYoutubeChannelLease } =
    await import("../../src/repositories/youtubeAlertRepository.js")

describe("upsertYoutubeChannelLease channel-id validation", () => {
    beforeEach(() => {
        resetDb()
    })

    it("throws and skips Prisma upsert when the YouTube channel id is invalid", async () => {
        for (const bad of INVALID_CHANNEL_IDS) {
            resetDb()
            await assert.rejects(
                () => upsertYoutubeChannelLease(bad, expiresAt),
                /invalid YouTube channel id/
            )
            assert.equal(db.upsertCalls, 0)
            assert.equal(db.lastUpsertArgs, null)
        }
    })

    it("trims the channel id and upserts by youtubeChannelId only", async () => {
        const saved = await upsertYoutubeChannelLease(`  ${VALID_CHANNEL_ID}  `, expiresAt)

        assert.equal(db.upsertCalls, 1)
        assert.deepEqual(db.lastUpsertArgs, {
            where: { youtubeChannelId: VALID_CHANNEL_ID },
            create: { youtubeChannelId: VALID_CHANNEL_ID, leaseExpiresAt: expiresAt },
            update: { leaseExpiresAt: expiresAt },
        })
        const where = db.lastUpsertArgs?.where ?? {}
        assert.equal("guildId" in where, false)
        assert.equal("id" in where, false)
        assert.deepEqual(saved, {
            youtubeChannelId: VALID_CHANNEL_ID,
            leaseExpiresAt: expiresAt,
            updatedAt,
        })
    })

    it("rethrows when upsert fails so a dropped lease is not treated as saved", async () => {
        db.upsertThrows = true
        await assert.rejects(
            () => upsertYoutubeChannelLease(VALID_CHANNEL_ID, expiresAt),
            /connection lost/
        )
        assert.equal(db.upsertCalls, 1)
        assert.deepEqual(db.lastUpsertArgs, {
            where: { youtubeChannelId: VALID_CHANNEL_ID },
            create: { youtubeChannelId: VALID_CHANNEL_ID, leaseExpiresAt: expiresAt },
            update: { leaseExpiresAt: expiresAt },
        })
    })
})

describe("deleteYoutubeChannelLease channel-id validation", () => {
    beforeEach(() => {
        resetDb()
    })

    it("throws and skips deleteMany when the YouTube channel id is invalid", async () => {
        for (const bad of INVALID_CHANNEL_IDS) {
            resetDb()
            await assert.rejects(() => deleteYoutubeChannelLease(bad), /invalid YouTube channel id/)
            assert.equal(db.deleteManyCalls, 0)
            assert.equal(db.lastDeleteManyArgs, null)
        }
    })

    it("deleteMany where is the trimmed youtubeChannelId, not a guild-scoped composite", async () => {
        await deleteYoutubeChannelLease(`  ${VALID_CHANNEL_ID}  `)

        assert.equal(db.deleteManyCalls, 1)
        assert.deepEqual(db.lastDeleteManyArgs, {
            where: { youtubeChannelId: VALID_CHANNEL_ID },
        })
        const where = db.lastDeleteManyArgs?.where ?? {}
        assert.equal("guildId" in where, false)
        assert.equal("id" in where, false)
    })

    it("rethrows when deleteMany fails so a live lease is not treated as dropped", async () => {
        db.deleteManyThrows = true
        await assert.rejects(() => deleteYoutubeChannelLease(VALID_CHANNEL_ID), /connection lost/)
        assert.equal(db.deleteManyCalls, 1)
        assert.deepEqual(db.lastDeleteManyArgs, {
            where: { youtubeChannelId: VALID_CHANNEL_ID },
        })
    })
})
