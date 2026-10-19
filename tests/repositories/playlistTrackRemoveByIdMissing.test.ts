import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const db = {
    findFirstRow: null as null | { id: number; playlistId: number; position: number },
    findFirstThrows: null as null | Error,
    findFirstCalls: [] as Array<{ where: { id?: number; playlistId?: number } }>,
    deleteCalls: [] as Array<{ where: { id?: number } }>,
    updateManyCalls: [] as Array<{
        where: { playlistId?: number; position?: { gt?: number } }
        data: { position?: { decrement?: number } }
    }>,
    playlistUpdateCalls: [] as Array<{ where: { id?: number } }>,
}

function resetDb() {
    db.findFirstRow = null
    db.findFirstThrows = null
    db.findFirstCalls = []
    db.deleteCalls = []
    db.updateManyCalls = []
    db.playlistUpdateCalls = []
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
                const tx = {
                    playlistTrack: {
                        findFirst: async ({
                            where,
                        }: {
                            where: { id?: number; playlistId?: number }
                        }) => {
                            db.findFirstCalls.push({ where })
                            if (db.findFirstThrows) throw db.findFirstThrows
                            return db.findFirstRow
                        },
                        delete: async ({ where }: { where: { id?: number } }) => {
                            db.deleteCalls.push({ where })
                            return { id: where.id }
                        },
                        updateMany: async (args: {
                            where: { playlistId?: number; position?: { gt?: number } }
                            data: { position?: { decrement?: number } }
                        }) => {
                            db.updateManyCalls.push(args)
                            return { count: 0 }
                        },
                    },
                    playlist: {
                        update: async ({ where }: { where: { id?: number } }) => {
                            db.playlistUpdateCalls.push({ where })
                            return { id: where.id }
                        },
                    },
                }
                return fn(tx)
            },
        }),
    },
})

const { removeTrackFromPlaylistById, PlaylistTrackNotFoundError } =
    await import("../../src/repositories/playlistRepository.js")

describe("removeTrackFromPlaylistById playlist-scoped miss", () => {
    beforeEach(() => {
        resetDb()
    })

    it("throws PlaylistTrackNotFoundError when findFirst returns no row", async () => {
        db.findFirstRow = null
        await assert.rejects(
            () => removeTrackFromPlaylistById(7, 42),
            (err: unknown) => {
                assert.equal(err instanceof PlaylistTrackNotFoundError, true)
                assert.equal((err as Error).name, "PlaylistTrackNotFoundError")
                assert.equal((err as Error).message, "Track not found in this playlist.")
                return true
            }
        )
        assert.equal(db.deleteCalls.length, 0)
        assert.equal(db.updateManyCalls.length, 0)
        assert.equal(db.playlistUpdateCalls.length, 0)
    })

    it("scopes findFirst to both track id and playlist id (not id alone)", async () => {
        db.findFirstRow = null
        await assert.rejects(() => removeTrackFromPlaylistById(7, 42), PlaylistTrackNotFoundError)
        assert.equal(db.findFirstCalls.length, 1)
        assert.deepEqual(db.findFirstCalls[0]?.where, { id: 42, playlistId: 7 })
        // A track that belongs to a different playlist would not match this where.
        assert.notEqual(db.findFirstCalls[0]?.where.playlistId, 99)
    })

    it("deletes the row and decrements later positions when the track is in the playlist", async () => {
        db.findFirstRow = { id: 42, playlistId: 7, position: 3 }
        await removeTrackFromPlaylistById(7, 42)
        assert.deepEqual(db.findFirstCalls[0]?.where, { id: 42, playlistId: 7 })
        assert.equal(db.deleteCalls.length, 1)
        assert.deepEqual(db.deleteCalls[0]?.where, { id: 42 })
        assert.equal(db.updateManyCalls.length, 1)
        assert.deepEqual(db.updateManyCalls[0]?.where, { playlistId: 7, position: { gt: 3 } })
        assert.deepEqual(db.updateManyCalls[0]?.data, { position: { decrement: 1 } })
        assert.equal(db.playlistUpdateCalls.length, 1)
        assert.deepEqual(db.playlistUpdateCalls[0]?.where, { id: 7 })
    })

    it("rethrows a database error instead of mapping it to PlaylistTrackNotFoundError", async () => {
        db.findFirstThrows = new Error("connection lost")
        await assert.rejects(
            () => removeTrackFromPlaylistById(7, 42),
            (err: unknown) => {
                assert.equal(err instanceof PlaylistTrackNotFoundError, false)
                assert.equal((err as Error).message, "connection lost")
                return true
            }
        )
        assert.equal(db.findFirstCalls.length, 1)
        assert.equal(db.deleteCalls.length, 0)
        assert.equal(db.updateManyCalls.length, 0)
        assert.equal(db.playlistUpdateCalls.length, 0)
    })
})
