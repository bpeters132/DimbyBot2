import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import { Prisma } from "@prisma/client"

const trackInput = {
    title: "Song",
    uri: "https://example.com/song",
    author: "Artist",
    duration: 120,
    thumbnailUrl: null,
    addedAt: new Date("2026-01-01T00:00:00.000Z"),
}

function uniqueConstraintError() {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "0.0.0",
        meta: { modelName: "PlaylistTrack", target: ["playlistId", "position"] },
    })
}

const db = {
    transactionCalls: 0,
    failNextTransactions: 0,
    failWith: "P2002" as "P2002" | "other",
    maxPosition: 2,
    createCalls: 0,
}

function resetDb() {
    db.transactionCalls = 0
    db.failNextTransactions = 0
    db.failWith = "P2002"
    db.maxPosition = 2
    db.createCalls = 0
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
                db.transactionCalls += 1
                if (db.failNextTransactions > 0) {
                    db.failNextTransactions -= 1
                    if (db.failWith === "P2002") throw uniqueConstraintError()
                    throw new Error("connection lost")
                }
                const tx = {
                    playlistTrack: {
                        aggregate: async () => ({ _max: { position: db.maxPosition } }),
                        create: async ({ data }: { data: Record<string, unknown> }) => {
                            db.createCalls += 1
                            return {
                                id: 10 + db.createCalls,
                                playlistId: data.playlistId,
                                title: data.title,
                                uri: data.uri,
                                author: data.author,
                                duration: data.duration,
                                thumbnailUrl: data.thumbnailUrl ?? null,
                                addedAt: data.addedAt,
                                position: data.position,
                            }
                        },
                    },
                    playlist: {
                        update: async () => ({ id: 1 }),
                    },
                }
                return fn(tx)
            },
        }),
    },
})

const { addTracksToPlaylist } = await import("../../src/repositories/playlistRepository.js")

describe("addTracksToPlaylist unique-position retry", () => {
    beforeEach(() => {
        resetDb()
    })

    it("returns an empty list without opening a transaction", async () => {
        const rows = await addTracksToPlaylist(1, [])
        assert.deepEqual(rows, [])
        assert.equal(db.transactionCalls, 0)
    })

    it("appends at max(position)+1 on the first attempt", async () => {
        const rows = await addTracksToPlaylist(1, [trackInput, { ...trackInput, title: "B" }])
        assert.equal(db.transactionCalls, 1)
        assert.equal(rows.length, 2)
        assert.equal(rows[0]?.position, 3)
        assert.equal(rows[1]?.position, 4)
        assert.equal(rows[0]?.title, "Song")
        assert.equal(rows[1]?.title, "B")
    })

    it("retries a unique (playlistId, position) collision and then appends", async () => {
        db.failNextTransactions = 1
        const rows = await addTracksToPlaylist(1, [trackInput])
        assert.equal(db.transactionCalls, 2)
        assert.equal(rows.length, 1)
        assert.equal(rows[0]?.position, 3)
        assert.equal(rows[0]?.uri, trackInput.uri)
    })

    it("throws the unique-constraint error after 4 collisions", { timeout: 2000 }, async () => {
        db.failNextTransactions = 4
        await assert.rejects(
            () => addTracksToPlaylist(1, [trackInput]),
            (err: unknown) => {
                assert.equal(err instanceof Prisma.PrismaClientKnownRequestError, true)
                assert.equal((err as Prisma.PrismaClientKnownRequestError).code, "P2002")
                return true
            }
        )
        assert.equal(db.transactionCalls, 4)
        assert.equal(db.createCalls, 0)
    })

    it("does not retry a non-unique database error", async () => {
        db.failNextTransactions = 4
        db.failWith = "other"
        await assert.rejects(() => addTracksToPlaylist(1, [trackInput]), /connection lost/)
        assert.equal(db.transactionCalls, 1)
        assert.equal(db.createCalls, 0)
    })
})
