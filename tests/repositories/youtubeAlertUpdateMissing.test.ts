import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import { Prisma } from "@prisma/client"

const now = new Date("2026-01-01T00:00:00.000Z")
const VALID_SNOWFLAKE = "123456789012345678"
const VALID_ROLE = "987654321098765432"

function recordNotFoundError() {
    return new Prisma.PrismaClientKnownRequestError("Record to update not found.", {
        code: "P2025",
        clientVersion: "0.0.0",
        meta: { modelName: "YoutubeAlert" },
    })
}

const db = {
    updateThrows: null as null | "P2025" | "P2002" | "other",
    updateCalls: 0,
    lastUpdateArgs: null as { where: { id: number }; data: Record<string, unknown> } | null,
}

function resetDb() {
    db.updateThrows = null
    db.updateCalls = 0
    db.lastUpdateArgs = null
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            youtubeAlert: {
                update: async (args: { where: { id: number }; data: Record<string, unknown> }) => {
                    db.updateCalls += 1
                    db.lastUpdateArgs = args
                    if (db.updateThrows === "P2025") throw recordNotFoundError()
                    if (db.updateThrows === "P2002") {
                        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
                            code: "P2002",
                            clientVersion: "0.0.0",
                        })
                    }
                    if (db.updateThrows === "other") throw new Error("connection lost")
                    return {
                        id: args.where.id,
                        watchId: 11,
                        discordChannelId: args.data.discordChannelId ?? "111111111111111111",
                        mentionRoleIds: args.data.mentionRoleIds ?? [VALID_ROLE],
                        messageTemplate:
                            args.data.messageTemplate === undefined
                                ? "Go watch"
                                : args.data.messageTemplate,
                        eventTypes: [
                            ...((args.data.eventTypes as string[]) ?? ["video"]),
                            "not-a-type",
                        ],
                        createdBy: "222222222222222222",
                        createdAt: now,
                    }
                },
            },
        }),
    },
})

const { updateYoutubeAlert } = await import("../../src/repositories/youtubeAlertRepository.js")

describe("updateYoutubeAlert missing row", () => {
    beforeEach(() => {
        resetDb()
    })

    it("returns null when Prisma reports P2025 (row gone)", async () => {
        db.updateThrows = "P2025"
        const result = await updateYoutubeAlert(9, { discordChannelId: VALID_SNOWFLAKE })
        assert.equal(result, null)
        assert.equal(db.updateCalls, 1)
        assert.deepEqual(db.lastUpdateArgs, {
            where: { id: 9 },
            data: { discordChannelId: VALID_SNOWFLAKE },
        })
    })

    it("maps a successful update through toAlert (copies roles, drops unknown event types)", async () => {
        const result = await updateYoutubeAlert(4, {
            mentionRoleIds: [VALID_ROLE, VALID_ROLE],
            eventTypes: ["video", "live"],
            messageTemplate: "  hi  ",
        })
        assert.equal(result?.id, 4)
        assert.equal(result?.watchId, 11)
        assert.equal(result?.discordChannelId, "111111111111111111")
        assert.deepEqual(result?.mentionRoleIds, [VALID_ROLE])
        assert.notEqual(result?.mentionRoleIds, db.lastUpdateArgs?.data.mentionRoleIds)
        assert.equal(result?.messageTemplate, "hi")
        assert.deepEqual(result?.eventTypes, ["video", "live"])
        assert.equal(result?.createdBy, "222222222222222222")
        assert.equal(db.updateCalls, 1)
    })

    it("does not map a non-P2025 Prisma error to null", async () => {
        db.updateThrows = "P2002"
        await assert.rejects(
            () => updateYoutubeAlert(4, { discordChannelId: VALID_SNOWFLAKE }),
            (err: unknown) => {
                assert.notEqual(err, null)
                assert.equal(err instanceof Prisma.PrismaClientKnownRequestError, true)
                assert.equal((err as Prisma.PrismaClientKnownRequestError).code, "P2002")
                return true
            }
        )
        assert.equal(db.updateCalls, 1)
    })

    it("rethrows a non-Prisma database error", async () => {
        db.updateThrows = "other"
        await assert.rejects(
            () => updateYoutubeAlert(4, { discordChannelId: VALID_SNOWFLAKE }),
            /connection lost/
        )
        assert.equal(db.updateCalls, 1)
    })
})
