import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const GUILD_A = "123456789012345678"
const GUILD_B = "987654321098765432"
const CHANNEL_A = "111111111111111111"
const CHANNEL_B = "222222222222222222"
const MESSAGE_1 = "333333333333333333"
const MESSAGE_2 = "444444444444444444"
const MESSAGE_3 = "555555555555555555"
const USER_A = "666666666666666666"
const USER_B = "777777777777777777"
const ROLE_A = "888888888888888888"
const targetTime = new Date("2030-01-15T18:00:00.000Z")
const laterTarget = new Date("2030-06-01T12:00:00.000Z")
const createdAt = new Date("2026-01-01T00:00:00.000Z")
const laterCreatedAt = new Date("2026-02-01T00:00:00.000Z")

const db = {
    findManyCalls: 0,
    lastFindManyArgs: undefined as unknown,
    throwOnFindMany: false,
    rows: [] as Record<string, unknown>[],
}

function resetDb() {
    db.findManyCalls = 0
    db.lastFindManyArgs = undefined
    db.throwOnFindMany = false
    db.rows = []
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            countdown: {
                findMany: async (args?: unknown) => {
                    db.findManyCalls += 1
                    db.lastFindManyArgs = args
                    if (db.throwOnFindMany) throw new Error("connection lost")
                    return db.rows
                },
            },
        }),
    },
})

const { getAllCountdownsFromDatabase } =
    await import("../../src/repositories/countdownRepository.js")

function countdownRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 1,
        guildId: GUILD_A,
        channelId: CHANNEL_A,
        messageId: MESSAGE_1,
        eventName: "Launch",
        description: "Soon",
        imageUrl: "https://example.test/banner.png",
        color: 0xff0000,
        footer: "footer",
        finishMessage: "done",
        mentionRoleId: ROLE_A,
        targetTime,
        createdBy: USER_A,
        createdAt,
        extraPrismaField: "must-not-leak",
        guild: { id: GUILD_A },
        ...overrides,
    }
}

function seedTwoGuildsSameChannelShape() {
    db.rows.push(
        countdownRow({
            id: 7,
            guildId: GUILD_A,
            channelId: CHANNEL_A,
            messageId: MESSAGE_1,
            eventName: "Launch",
            createdBy: USER_A,
        }),
        countdownRow({
            id: 8,
            guildId: GUILD_A,
            channelId: CHANNEL_A,
            messageId: MESSAGE_2,
            eventName: "Afterparty",
            description: null,
            imageUrl: null,
            color: null,
            footer: null,
            finishMessage: null,
            mentionRoleId: null,
            targetTime: laterTarget,
            createdBy: USER_A,
            createdAt: laterCreatedAt,
        }),
        countdownRow({
            id: 9,
            guildId: GUILD_B,
            channelId: CHANNEL_B,
            messageId: MESSAGE_3,
            eventName: "Other guild",
            createdBy: USER_B,
        })
    )
}

describe("getAllCountdownsFromDatabase store-init mapping", () => {
    beforeEach(() => {
        resetDb()
    })

    it("keys the store by countdown id so two countdowns in one guild both survive", async () => {
        seedTwoGuildsSameChannelShape()

        const loaded = await getAllCountdownsFromDatabase()

        assert.deepEqual(Object.keys(loaded).sort(), ["7", "8", "9"])
        assert.equal(loaded[7]?.eventName, "Launch")
        assert.equal(loaded[8]?.eventName, "Afterparty")
        assert.equal(loaded[9]?.eventName, "Other guild")
        assert.equal(GUILD_A in loaded, false)
        assert.equal(CHANNEL_A in loaded, false)
        assert.equal(MESSAGE_1 in loaded, false)
    })

    it("maps rows without Prisma extras and preserves Date fields", async () => {
        seedTwoGuildsSameChannelShape()

        const loaded = await getAllCountdownsFromDatabase()

        assert.deepEqual(loaded[7], {
            id: 7,
            guildId: GUILD_A,
            channelId: CHANNEL_A,
            messageId: MESSAGE_1,
            eventName: "Launch",
            description: "Soon",
            imageUrl: "https://example.test/banner.png",
            color: 0xff0000,
            footer: "footer",
            finishMessage: "done",
            mentionRoleId: ROLE_A,
            targetTime,
            createdBy: USER_A,
            createdAt,
        })
        assert.equal("extraPrismaField" in loaded[7], false)
        assert.equal("guild" in loaded[7], false)
        assert.ok(loaded[7].targetTime instanceof Date)
        assert.ok(loaded[7].createdAt instanceof Date)
        assert.equal(loaded[7].targetTime, targetTime)
        assert.equal(loaded[7].createdAt, createdAt)

        assert.deepEqual(loaded[8], {
            id: 8,
            guildId: GUILD_A,
            channelId: CHANNEL_A,
            messageId: MESSAGE_2,
            eventName: "Afterparty",
            description: null,
            imageUrl: null,
            color: null,
            footer: null,
            finishMessage: null,
            mentionRoleId: null,
            targetTime: laterTarget,
            createdBy: USER_A,
            createdAt: laterCreatedAt,
        })
    })

    it("loads every row with unfiltered findMany so other guilds are not dropped", async () => {
        seedTwoGuildsSameChannelShape()

        const loaded = await getAllCountdownsFromDatabase()

        assert.equal(db.findManyCalls, 1)
        if (db.lastFindManyArgs !== undefined && db.lastFindManyArgs !== null) {
            assert.equal(typeof db.lastFindManyArgs, "object")
            assert.equal("where" in (db.lastFindManyArgs as object), false)
        }
        assert.equal(Object.keys(loaded).length, 3)
        assert.equal(loaded[9]?.guildId, GUILD_B)
        assert.equal(loaded[7]?.guildId, GUILD_A)
        assert.equal(loaded[8]?.guildId, GUILD_A)
    })

    it("returns an empty store when the table is empty", async () => {
        const loaded = await getAllCountdownsFromDatabase()

        assert.deepEqual(loaded, {})
        assert.equal(db.findManyCalls, 1)
    })

    it("rethrows when findMany fails so store init cannot start empty", async () => {
        seedTwoGuildsSameChannelShape()
        db.throwOnFindMany = true
        await assert.rejects(() => getAllCountdownsFromDatabase(), /connection lost/)
        assert.equal(db.findManyCalls, 1)
    })
})
