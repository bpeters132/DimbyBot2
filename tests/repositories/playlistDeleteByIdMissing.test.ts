import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const db = {
    deleteCount: 1,
    deleteThrows: null as null | Error,
    deleteManyCalls: [] as Array<{ where: { id?: number; userId?: string; name?: string } }>,
}

function resetDb() {
    db.deleteCount = 1
    db.deleteThrows = null
    db.deleteManyCalls = []
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            playlist: {
                deleteMany: async ({
                    where,
                }: {
                    where: { id?: number; userId?: string; name?: string }
                }) => {
                    db.deleteManyCalls.push({ where })
                    if (db.deleteThrows) throw db.deleteThrows
                    return { count: db.deleteCount }
                },
            },
        }),
    },
})

const { deletePlaylistById, PlaylistNotFoundError } =
    await import("../../src/repositories/playlistRepository.js")

describe("deletePlaylistById owned-row miss", () => {
    beforeEach(() => {
        resetDb()
    })

    it("throws PlaylistNotFoundError when deleteMany removes zero rows", async () => {
        db.deleteCount = 0
        await assert.rejects(
            () => deletePlaylistById("user-a", 42),
            (err: unknown) => {
                assert.equal(err instanceof PlaylistNotFoundError, true)
                assert.equal((err as Error).name, "PlaylistNotFoundError")
                assert.equal((err as Error).message, "Playlist not found.")
                return true
            }
        )
        assert.equal(db.deleteManyCalls.length, 1)
    })

    it("scopes deleteMany to owned {id, userId} and not playlist name", async () => {
        db.deleteCount = 0
        await assert.rejects(() => deletePlaylistById("user-a", 42), PlaylistNotFoundError)
        assert.deepEqual(db.deleteManyCalls[0]?.where, { id: 42, userId: "user-a" })
        assert.equal("name" in (db.deleteManyCalls[0]?.where ?? {}), false)
        // A successor playlist that reused the name would have a different id.
        assert.notEqual(db.deleteManyCalls[0]?.where.id, 99)
    })

    it("resolves when deleteMany removes the owned row", async () => {
        await deletePlaylistById("user-a", 42)
        assert.equal(db.deleteManyCalls.length, 1)
        assert.deepEqual(db.deleteManyCalls[0]?.where, { id: 42, userId: "user-a" })
    })

    it("rethrows a database error instead of mapping it to PlaylistNotFoundError", async () => {
        db.deleteThrows = new Error("connection lost")
        await assert.rejects(
            () => deletePlaylistById("user-a", 42),
            (err: unknown) => {
                assert.equal(err instanceof PlaylistNotFoundError, false)
                assert.equal((err as Error).message, "connection lost")
                return true
            }
        )
        assert.equal(db.deleteManyCalls.length, 1)
    })
})
