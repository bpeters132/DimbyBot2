import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"
import type { UploadEventType, YoutubeAlertInput } from "../../src/types/index.js"

const now = new Date("2026-01-01T00:00:00.000Z")
const GUILD_ID = "123456789012345678"
const DISCORD_CHANNEL_ID = "111111111111111111"
const CREATED_BY = "222222222222222222"
const VALID_ROLE = "987654321098765432"
const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

type WatchRow = {
    id: number
    guildId: string
    youtubeChannelId: string
    youtubeChannelName: string
    createdAt: Date
}

const db = {
    existingWatch: null as WatchRow | null,
    findCalls: 0,
    lastFindArgs: null as unknown,
    findThrows: false,
    transactionCalls: 0,
    transactionThrows: false,
    watchCreates: [] as Array<Record<string, unknown>>,
    alertCreates: [] as Array<Record<string, unknown>>,
}

function resetDb() {
    db.existingWatch = null
    db.findCalls = 0
    db.lastFindArgs = null
    db.findThrows = false
    db.transactionCalls = 0
    db.transactionThrows = false
    db.watchCreates = []
    db.alertCreates = []
}

function existingWatch(overrides: Partial<WatchRow> = {}): WatchRow {
    return {
        id: 11,
        guildId: GUILD_ID,
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        createdAt: now,
        ...overrides,
    }
}

function validInput(overrides: Partial<YoutubeAlertInput> = {}): YoutubeAlertInput {
    return {
        guildId: GUILD_ID,
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        discordChannelId: DISCORD_CHANNEL_ID,
        mentionRoleIds: [VALID_ROLE],
        messageTemplate: "Go watch",
        eventTypes: ["video"],
        createdBy: CREATED_BY,
        ...overrides,
    }
}

function alertCreateResult(data: Record<string, unknown>) {
    return {
        id: 4,
        watchId: data.watchId,
        discordChannelId: data.discordChannelId,
        mentionRoleIds: data.mentionRoleIds,
        messageTemplate: data.messageTemplate,
        eventTypes: [...((data.eventTypes as string[]) ?? []), "not-a-type"],
        createdBy: data.createdBy,
        createdAt: now,
    }
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            youtubeWatch: {
                findUnique: async (args: unknown) => {
                    db.findCalls += 1
                    db.lastFindArgs = args
                    if (db.findThrows) throw new Error("connection lost")
                    return db.existingWatch
                },
            },
            youtubeAlert: {
                create: async ({ data }: { data: Record<string, unknown> }) => {
                    db.alertCreates.push(data)
                    return alertCreateResult(data)
                },
            },
            $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
                db.transactionCalls += 1
                if (db.transactionThrows) throw new Error("connection lost")
                const tx = {
                    youtubeWatch: {
                        create: async ({ data }: { data: Record<string, unknown> }) => {
                            db.watchCreates.push(data)
                            return { id: 11, ...data, createdAt: now }
                        },
                    },
                    youtubeAlert: {
                        create: async ({ data }: { data: Record<string, unknown> }) => {
                            db.alertCreates.push(data)
                            return alertCreateResult(data)
                        },
                    },
                }
                return fn(tx)
            },
        }),
    },
})

const { createYoutubeAlertWithWatch } =
    await import("../../src/repositories/youtubeAlertRepository.js")

describe("createYoutubeAlertWithWatch existing vs new Watch", () => {
    beforeEach(() => {
        resetDb()
    })

    it("throws and skips lookup when guildId or YouTube channel id is invalid", async () => {
        const cases: Array<{ input: Partial<YoutubeAlertInput>; message: RegExp }> = [
            {
                input: { guildId: "not-a-snowflake" },
                message: /invalid Discord snowflake for guildId/,
            },
            { input: { guildId: "" }, message: /invalid Discord snowflake for guildId/ },
            { input: { guildId: "0" }, message: /invalid Discord snowflake for guildId/ },
            { input: { youtubeChannelId: "UCshort" }, message: /invalid YouTube channel id/ },
            { input: { youtubeChannelId: "@somehandle" }, message: /invalid YouTube channel id/ },
        ]
        for (const { input, message } of cases) {
            resetDb()
            await assert.rejects(() => createYoutubeAlertWithWatch(validInput(input)), message)
            assert.equal(db.findCalls, 0)
            assert.equal(db.transactionCalls, 0)
            assert.deepEqual(db.watchCreates, [])
            assert.deepEqual(db.alertCreates, [])
        }
    })

    it("looks up Watch by guild+channel and creates only an Alert when the Watch exists", async () => {
        db.existingWatch = existingWatch()
        const result = await createYoutubeAlertWithWatch(
            validInput({
                guildId: `  ${GUILD_ID}  `,
                youtubeChannelId: `  ${CHANNEL_ID}  `,
                mentionRoleIds: [VALID_ROLE, VALID_ROLE],
                messageTemplate: "  hi  ",
                eventTypes: ["video", "not-a-type"] as unknown as UploadEventType[],
            })
        )

        assert.equal(db.findCalls, 1)
        assert.deepEqual(db.lastFindArgs, {
            where: {
                guildId_youtubeChannelId: { guildId: GUILD_ID, youtubeChannelId: CHANNEL_ID },
            },
        })
        assert.equal(db.transactionCalls, 0)
        assert.deepEqual(db.watchCreates, [])
        assert.equal(db.alertCreates.length, 1)
        assert.deepEqual(db.alertCreates[0], {
            watchId: 11,
            discordChannelId: DISCORD_CHANNEL_ID,
            mentionRoleIds: [VALID_ROLE],
            messageTemplate: "hi",
            eventTypes: ["video"],
            createdBy: CREATED_BY,
        })

        assert.equal(result.createdWatch, false)
        assert.equal(result.watch.id, 11)
        assert.equal(result.watch.guildId, GUILD_ID)
        assert.equal(result.watch.youtubeChannelId, CHANNEL_ID)
        assert.equal(result.watch.youtubeChannelName, "LTT")
        assert.equal(result.alert.id, 4)
        assert.equal(result.alert.watchId, 11)
        assert.deepEqual(result.alert.mentionRoleIds, [VALID_ROLE])
        assert.notEqual(result.alert.mentionRoleIds, db.alertCreates[0]?.mentionRoleIds)
        assert.equal(result.alert.messageTemplate, "hi")
        assert.deepEqual(result.alert.eventTypes, ["video"])
    })

    it("creates Watch+Alert in one transaction when the guild has no Watch yet", async () => {
        db.existingWatch = null
        const result = await createYoutubeAlertWithWatch(
            validInput({
                youtubeChannelName: "   ",
                messageTemplate: "  ",
            })
        )

        assert.equal(db.findCalls, 1)
        assert.deepEqual(db.lastFindArgs, {
            where: {
                guildId_youtubeChannelId: { guildId: GUILD_ID, youtubeChannelId: CHANNEL_ID },
            },
        })
        assert.equal(db.transactionCalls, 1)
        assert.deepEqual(db.watchCreates, [
            {
                guildId: GUILD_ID,
                youtubeChannelId: CHANNEL_ID,
                youtubeChannelName: CHANNEL_ID,
            },
        ])
        assert.equal(db.alertCreates.length, 1)
        assert.equal(db.alertCreates[0]?.watchId, 11)
        assert.equal(db.alertCreates[0]?.discordChannelId, DISCORD_CHANNEL_ID)
        assert.equal(db.alertCreates[0]?.messageTemplate, null)
        assert.deepEqual(db.alertCreates[0]?.eventTypes, ["video"])
        assert.equal(db.alertCreates[0]?.createdBy, CREATED_BY)

        assert.equal(result.createdWatch, true)
        assert.equal(result.watch.id, 11)
        assert.equal(result.watch.youtubeChannelName, CHANNEL_ID)
        assert.equal(result.alert.id, 4)
        assert.equal(result.alert.watchId, 11)
        assert.equal(result.alert.messageTemplate, null)
        assert.deepEqual(result.alert.eventTypes, ["video"])
    })

    it("does not create an Alert when an existing Watch path has an invalid Discord channel id", async () => {
        db.existingWatch = existingWatch()
        await assert.rejects(
            () => createYoutubeAlertWithWatch(validInput({ discordChannelId: "not-a-snowflake" })),
            /invalid Discord snowflake for discordChannelId/
        )
        assert.equal(db.findCalls, 1)
        assert.equal(db.transactionCalls, 0)
        assert.deepEqual(db.watchCreates, [])
        assert.deepEqual(db.alertCreates, [])
    })

    it("rethrows when Watch lookup fails", async () => {
        db.findThrows = true
        await assert.rejects(() => createYoutubeAlertWithWatch(validInput()), /connection lost/)
        assert.equal(db.findCalls, 1)
        assert.equal(db.transactionCalls, 0)
        assert.deepEqual(db.watchCreates, [])
        assert.deepEqual(db.alertCreates, [])
    })

    it("rethrows when the new-Watch transaction fails", async () => {
        db.transactionThrows = true
        await assert.rejects(() => createYoutubeAlertWithWatch(validInput()), /connection lost/)
        assert.equal(db.findCalls, 1)
        assert.equal(db.transactionCalls, 1)
        assert.deepEqual(db.watchCreates, [])
        assert.deepEqual(db.alertCreates, [])
    })
})
