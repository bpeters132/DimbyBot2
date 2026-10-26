import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import type { CountdownInput } from "../../src/types/index.js"

const VALID_SNOWFLAKE = "123456789012345678"
const VALID_CHANNEL = "987654321098765432"
const VALID_MESSAGE = "111222333444555666"
const VALID_USER = "222333444555666777"
const VALID_ROLE = "333444555666777888"
const targetTime = new Date("2030-01-15T18:00:00.000Z")
const createdAt = new Date("2026-01-01T00:00:00.000Z")

const db = {
    createCalls: 0,
    lastCreateData: null as Record<string, unknown> | null,
    createThrows: null as null | Error,
}

function resetDb() {
    db.createCalls = 0
    db.lastCreateData = null
    db.createThrows = null
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            countdown: {
                create: async ({ data }: { data: Record<string, unknown> }) => {
                    db.createCalls += 1
                    db.lastCreateData = data
                    if (db.createThrows) throw db.createThrows
                    return {
                        id: 7,
                        ...data,
                        createdAt,
                    }
                },
            },
        }),
    },
})

const { createCountdown } = await import("../../src/repositories/countdownRepository.js")

function validInput(overrides: Partial<CountdownInput> = {}): CountdownInput {
    return {
        guildId: VALID_SNOWFLAKE,
        channelId: VALID_CHANNEL,
        messageId: VALID_MESSAGE,
        eventName: "Launch",
        description: "Soon",
        imageUrl: null,
        color: 0xff0000,
        footer: "footer",
        finishMessage: "done",
        mentionRoleId: null,
        targetTime,
        createdBy: VALID_USER,
        ...overrides,
    }
}

describe("createCountdown Discord snowflake validation", () => {
    beforeEach(() => {
        resetDb()
    })

    it("throws and skips Prisma create when a required snowflake is invalid", async () => {
        const required: Array<keyof CountdownInput> = [
            "guildId",
            "channelId",
            "messageId",
            "createdBy",
        ]
        for (const field of required) {
            resetDb()
            await assert.rejects(
                () => createCountdown(validInput({ [field]: "not-a-snowflake" })),
                (err: unknown) => {
                    assert.equal(err instanceof Error, true)
                    assert.equal(
                        (err as Error).message,
                        "createCountdown: invalid Discord snowflake in input."
                    )
                    return true
                }
            )
            assert.equal(db.createCalls, 0, `${field} must not reach prisma.countdown.create`)
        }
    })

    it("rejects empty, zero, and oversized required snowflakes before create", async () => {
        for (const bad of ["", "   ", "0", "18446744073709551616"]) {
            resetDb()
            await assert.rejects(
                () => createCountdown(validInput({ guildId: bad })),
                /invalid Discord snowflake in input/
            )
            assert.equal(db.createCalls, 0)
        }
    })

    it("trims valid required snowflakes and persists the normalized ids", async () => {
        const created = await createCountdown(
            validInput({
                guildId: `  ${VALID_SNOWFLAKE}  `,
                channelId: ` ${VALID_CHANNEL} `,
                messageId: `\t${VALID_MESSAGE}\t`,
                createdBy: ` ${VALID_USER} `,
            })
        )
        assert.equal(db.createCalls, 1)
        assert.equal(db.lastCreateData?.guildId, VALID_SNOWFLAKE)
        assert.equal(db.lastCreateData?.channelId, VALID_CHANNEL)
        assert.equal(db.lastCreateData?.messageId, VALID_MESSAGE)
        assert.equal(db.lastCreateData?.createdBy, VALID_USER)
        assert.equal(created.id, 7)
        assert.equal(created.guildId, VALID_SNOWFLAKE)
        assert.equal(created.channelId, VALID_CHANNEL)
        assert.equal(created.messageId, VALID_MESSAGE)
        assert.equal(created.createdBy, VALID_USER)
        assert.equal(created.eventName, "Launch")
        assert.equal(created.description, "Soon")
        assert.equal(created.color, 0xff0000)
        assert.equal(created.targetTime, targetTime)
        assert.equal(created.createdAt, createdAt)
        assert.equal(created.mentionRoleId, null)
    })

    it("stores a trimmed mentionRoleId when the optional role snowflake is valid", async () => {
        const created = await createCountdown(validInput({ mentionRoleId: `  ${VALID_ROLE}  ` }))
        assert.equal(db.createCalls, 1)
        assert.equal(db.lastCreateData?.mentionRoleId, VALID_ROLE)
        assert.equal(created.mentionRoleId, VALID_ROLE)
    })

    it("persists mentionRoleId as null when the optional role snowflake is invalid", async () => {
        const created = await createCountdown(validInput({ mentionRoleId: "not-a-role" }))
        assert.equal(db.createCalls, 1)
        assert.equal(db.lastCreateData?.mentionRoleId, null)
        assert.equal(created.mentionRoleId, null)
    })

    it("rethrows a database error after snowflake validation succeeds", async () => {
        db.createThrows = new Error("connection lost")
        await assert.rejects(() => createCountdown(validInput()), /connection lost/)
        assert.equal(db.createCalls, 1)
    })
})
