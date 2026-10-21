import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const db = {
    deleteCount: 1,
    deleteThrows: null as null | Error,
    deleteManyCalls: [] as Array<{
        where: { id?: number; guildId?: string; messageId?: string; channelId?: string }
    }>,
}

function resetDb() {
    db.deleteCount = 1
    db.deleteThrows = null
    db.deleteManyCalls = []
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            countdown: {
                deleteMany: async ({
                    where,
                }: {
                    where: { id?: number; guildId?: string; messageId?: string; channelId?: string }
                }) => {
                    db.deleteManyCalls.push({ where })
                    if (db.deleteThrows) throw db.deleteThrows
                    return { count: db.deleteCount }
                },
            },
        }),
    },
})

const { deleteCountdown } = await import("../../src/repositories/countdownRepository.js")

describe("deleteCountdown missing-row mapping", () => {
    beforeEach(() => {
        resetDb()
    })

    it("returns false when deleteMany removes zero rows", async () => {
        db.deleteCount = 0
        assert.equal(await deleteCountdown(42), false)
        assert.equal(db.deleteManyCalls.length, 1)
    })

    it("scopes deleteMany to {id} and not guild, channel, or message", async () => {
        db.deleteCount = 0
        assert.equal(await deleteCountdown(42), false)
        assert.deepEqual(db.deleteManyCalls[0]?.where, { id: 42 })
        assert.equal("guildId" in (db.deleteManyCalls[0]?.where ?? {}), false)
        assert.equal("channelId" in (db.deleteManyCalls[0]?.where ?? {}), false)
        assert.equal("messageId" in (db.deleteManyCalls[0]?.where ?? {}), false)
        // A different countdown would have a different id — untouched.
        assert.notEqual(db.deleteManyCalls[0]?.where.id, 99)
    })

    it("returns true when deleteMany removes the row", async () => {
        assert.equal(await deleteCountdown(42), true)
        assert.equal(db.deleteManyCalls.length, 1)
        assert.deepEqual(db.deleteManyCalls[0]?.where, { id: 42 })
    })

    it("rethrows a database error instead of mapping it to false", async () => {
        db.deleteThrows = new Error("connection lost")
        await assert.rejects(
            () => deleteCountdown(42),
            (err: unknown) => {
                assert.equal(err instanceof Error, true)
                assert.equal((err as Error).message, "connection lost")
                return true
            }
        )
        assert.equal(db.deleteManyCalls.length, 1)
    })
})
