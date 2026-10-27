import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const GUILD_A = "123456789012345678"
const GUILD_B = "987654321098765432"
const GUILD_C = "111222333444555666"
const CONTROL_CHANNEL_A = "111111111111111111"
const CONTROL_MESSAGE_A = "222222222222222222"
const LOG_CHANNEL_ALL = "333333333333333333"
const LOG_CHANNEL_ERROR = "444444444444444444"

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
            guildSettings: {
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

const { getGuildSettingsStoreFromDatabase } =
    await import("../../src/repositories/guildSettingsRepository.js")

function guildSettingsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        guildId: GUILD_A,
        controlChannelId: CONTROL_CHANNEL_A,
        controlMessageId: CONTROL_MESSAGE_A,
        downloadsMaxMb: 250,
        discordLog: {
            allChannelId: `  ${LOG_CHANNEL_ALL}  `,
            minLevel: "info",
            byLevel: { error: `  ${LOG_CHANNEL_ERROR}  `, nope: "ignored" },
            extra: true,
        },
        extraPrismaField: "must-not-leak",
        guild: { id: GUILD_A },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
        ...overrides,
    }
}

function seedThreeGuilds() {
    db.rows.push(
        guildSettingsRow(),
        guildSettingsRow({
            guildId: GUILD_B,
            controlChannelId: null,
            controlMessageId: null,
            downloadsMaxMb: null,
            discordLog: null,
            extraPrismaField: "must-not-leak-b",
            guild: { id: GUILD_B },
        }),
        guildSettingsRow({
            guildId: GUILD_C,
            controlChannelId: "",
            controlMessageId: "",
            downloadsMaxMb: 0,
            discordLog: [],
            extraPrismaField: "must-not-leak-c",
            guild: { id: GUILD_C },
        })
    )
}

describe("getGuildSettingsStoreFromDatabase store-init mapping", () => {
    beforeEach(() => {
        resetDb()
    })

    it("keys the store by guildId so two empty-channel guilds both survive", async () => {
        seedThreeGuilds()

        const loaded = await getGuildSettingsStoreFromDatabase()

        assert.deepEqual(Object.keys(loaded).sort(), [GUILD_A, GUILD_C, GUILD_B].sort())
        assert.equal(CONTROL_CHANNEL_A in loaded, false)
        assert.equal(CONTROL_MESSAGE_A in loaded, false)
        assert.equal("" in loaded, false)
        assert.equal("null" in loaded, false)
        assert.equal(loaded[GUILD_A]?.controlChannelId, CONTROL_CHANNEL_A)
        assert.deepEqual(loaded[GUILD_B], {})
        assert.deepEqual(loaded[GUILD_C], { downloadsMaxMb: 0 })
    })

    it("maps rows without Prisma extras and omits empty optional fields", async () => {
        seedThreeGuilds()

        const loaded = await getGuildSettingsStoreFromDatabase()

        assert.deepEqual(loaded[GUILD_A], {
            controlChannelId: CONTROL_CHANNEL_A,
            controlMessageId: CONTROL_MESSAGE_A,
            downloadsMaxMb: 250,
            discordLog: {
                allChannelId: LOG_CHANNEL_ALL,
                minLevel: "info",
                byLevel: { error: LOG_CHANNEL_ERROR },
            },
        })
        assert.equal("extraPrismaField" in loaded[GUILD_A], false)
        assert.equal("guild" in loaded[GUILD_A], false)
        assert.equal("createdAt" in loaded[GUILD_A], false)
        assert.equal("updatedAt" in loaded[GUILD_A], false)
        assert.equal("guildId" in loaded[GUILD_A], false)

        assert.equal("controlChannelId" in loaded[GUILD_B], false)
        assert.equal("controlMessageId" in loaded[GUILD_B], false)
        assert.equal("downloadsMaxMb" in loaded[GUILD_B], false)
        assert.equal("discordLog" in loaded[GUILD_B], false)
        assert.equal(Object.keys(loaded[GUILD_B]).length, 0)

        assert.equal("controlChannelId" in loaded[GUILD_C], false)
        assert.equal("controlMessageId" in loaded[GUILD_C], false)
        assert.equal("discordLog" in loaded[GUILD_C], false)
        assert.equal(loaded[GUILD_C].downloadsMaxMb, 0)
    })

    it("loads every row with unfiltered findMany so other guilds are not dropped", async () => {
        seedThreeGuilds()

        const loaded = await getGuildSettingsStoreFromDatabase()

        assert.equal(db.findManyCalls, 1)
        if (db.lastFindManyArgs !== undefined && db.lastFindManyArgs !== null) {
            assert.equal(typeof db.lastFindManyArgs, "object")
            assert.equal("where" in (db.lastFindManyArgs as object), false)
        }
        assert.equal(Object.keys(loaded).length, 3)
        assert.equal(GUILD_A in loaded, true)
        assert.equal(GUILD_B in loaded, true)
        assert.equal(GUILD_C in loaded, true)
    })

    it("returns an empty store when the table is empty", async () => {
        const loaded = await getGuildSettingsStoreFromDatabase()

        assert.deepEqual(loaded, {})
        assert.equal(db.findManyCalls, 1)
    })

    it("rethrows when findMany fails so store init cannot start empty", async () => {
        seedThreeGuilds()
        db.throwOnFindMany = true
        await assert.rejects(() => getGuildSettingsStoreFromDatabase(), /connection lost/)
        assert.equal(db.findManyCalls, 1)
    })
})
