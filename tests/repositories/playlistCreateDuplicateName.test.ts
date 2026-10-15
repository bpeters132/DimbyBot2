import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import { Prisma } from "@prisma/client"

const now = new Date("2026-01-01T00:00:00.000Z")

function uniqueNameError() {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "0.0.0",
        meta: { modelName: "Playlist", target: ["userId", "name"] },
    })
}

const db = {
    createThrows: null as null | "P2002" | "P2025" | "other",
    createCalls: 0,
    lastCreateData: null as { userId: string; name: string } | null,
}

function resetDb() {
    db.createThrows = null
    db.createCalls = 0
    db.lastCreateData = null
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            playlist: {
                create: async ({ data }: { data: { userId: string; name: string } }) => {
                    db.createCalls += 1
                    db.lastCreateData = data
                    if (db.createThrows === "P2002") throw uniqueNameError()
                    if (db.createThrows === "P2025") {
                        throw new Prisma.PrismaClientKnownRequestError("Record not found", {
                            code: "P2025",
                            clientVersion: "0.0.0",
                        })
                    }
                    if (db.createThrows === "other") throw new Error("connection lost")
                    return {
                        id: 7,
                        name: data.name,
                        userId: data.userId,
                        createdAt: now,
                        updatedAt: now,
                        tracks: [],
                    }
                },
            },
        }),
    },
})

const { createPlaylist, PlaylistDuplicateNameError } =
    await import("../../src/repositories/playlistRepository.js")

describe("createPlaylist unique (userId, name)", () => {
    beforeEach(() => {
        resetDb()
    })

    it("maps unique-constraint P2002 to PlaylistDuplicateNameError", async () => {
        db.createThrows = "P2002"
        await assert.rejects(
            () => createPlaylist("user-1", "Mix"),
            (err: unknown) => {
                assert.equal(err instanceof PlaylistDuplicateNameError, true)
                assert.equal((err as Error).name, "PlaylistDuplicateNameError")
                assert.equal((err as Error).message, 'A playlist named "Mix" already exists.')
                return true
            }
        )
        assert.equal(db.createCalls, 1)
        assert.deepEqual(db.lastCreateData, { userId: "user-1", name: "Mix" })
    })

    it("returns an empty playlist on success", async () => {
        const playlist = await createPlaylist("user-1", "Mix")
        assert.equal(playlist.id, 7)
        assert.equal(playlist.name, "Mix")
        assert.equal(playlist.userId, "user-1")
        assert.deepEqual(playlist.tracks, [])
        assert.equal(db.createCalls, 1)
    })

    it("does not map a non-P2002 Prisma error to PlaylistDuplicateNameError", async () => {
        db.createThrows = "P2025"
        await assert.rejects(
            () => createPlaylist("user-1", "Mix"),
            (err: unknown) => {
                assert.equal(err instanceof PlaylistDuplicateNameError, false)
                assert.equal(err instanceof Prisma.PrismaClientKnownRequestError, true)
                assert.equal((err as Prisma.PrismaClientKnownRequestError).code, "P2025")
                return true
            }
        )
        assert.equal(db.createCalls, 1)
    })

    it("rethrows a non-Prisma database error", async () => {
        db.createThrows = "other"
        await assert.rejects(() => createPlaylist("user-1", "Mix"), /connection lost/)
        assert.equal(db.createCalls, 1)
    })
})
