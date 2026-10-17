import assert from "node:assert/strict"
import { beforeEach, describe, it, mock } from "node:test"

const now = new Date("2026-01-01T00:00:00.000Z")
const VALID_ROLE = "987654321098765432"
const GUILD_ID = "123456789012345678"
const CHANNEL_ID = "UCXuqSBlHAE6Xw-yeJA0Tunw"

type AlertRow = {
    id: number
    watchId: number
    discordChannelId: string
    mentionRoleIds: string[]
    messageTemplate: string | null
    eventTypes: string[]
    createdBy: string
    createdAt: Date
}

type WatchRow = {
    id: number
    guildId: string
    youtubeChannelId: string
    youtubeChannelName: string
    createdAt: Date
}

const db = {
    found: null as (AlertRow & { watch: WatchRow & { alerts: AlertRow[] } }) | null,
    findCalls: 0,
    lastFindArgs: null as unknown,
    transactionCalls: 0,
    alertDeletes: [] as Array<{ id: number }>,
    watchDeletes: [] as Array<{ id: number }>,
    transactionThrows: false,
}

function resetDb() {
    db.found = null
    db.findCalls = 0
    db.lastFindArgs = null
    db.transactionCalls = 0
    db.alertDeletes = []
    db.watchDeletes = []
    db.transactionThrows = false
}

function alertRow(overrides: Partial<AlertRow> = {}): AlertRow {
    return {
        id: 4,
        watchId: 11,
        discordChannelId: "111111111111111111",
        mentionRoleIds: [VALID_ROLE],
        messageTemplate: "Go watch",
        eventTypes: ["video", "not-a-type"],
        createdBy: "222222222222222222",
        createdAt: now,
        ...overrides,
    }
}

function watchRow(overrides: Partial<WatchRow> = {}): WatchRow {
    return {
        id: 11,
        guildId: GUILD_ID,
        youtubeChannelId: CHANNEL_ID,
        youtubeChannelName: "LTT",
        createdAt: now,
        ...overrides,
    }
}

function foundRow(alerts: AlertRow[], alertOverrides: Partial<AlertRow> = {}) {
    const alert = alertRow(alertOverrides)
    const watch = { ...watchRow(), alerts }
    return { ...alert, watch }
}

mock.module("../../src/lib/database.js", {
    namedExports: {
        getPrismaClient: () => ({
            youtubeAlert: {
                findUnique: async (args: unknown) => {
                    db.findCalls += 1
                    db.lastFindArgs = args
                    return db.found
                },
            },
            $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
                db.transactionCalls += 1
                if (db.transactionThrows) throw new Error("connection lost")
                const tx = {
                    youtubeAlert: {
                        delete: async ({ where }: { where: { id: number } }) => {
                            db.alertDeletes.push(where)
                        },
                    },
                    youtubeWatch: {
                        delete: async ({ where }: { where: { id: number } }) => {
                            db.watchDeletes.push(where)
                        },
                    },
                }
                return fn(tx)
            },
        }),
    },
})

const { deleteYoutubeAlert } = await import("../../src/repositories/youtubeAlertRepository.js")

describe("deleteYoutubeAlert last-watch cascade", () => {
    beforeEach(() => {
        resetDb()
    })

    it("returns null when the Alert row is already gone (no transaction)", async () => {
        db.found = null
        const result = await deleteYoutubeAlert(9)
        assert.equal(result, null)
        assert.equal(db.findCalls, 1)
        assert.deepEqual(db.lastFindArgs, {
            where: { id: 9 },
            include: { watch: { include: { alerts: true } } },
        })
        assert.equal(db.transactionCalls, 0)
        assert.deepEqual(db.alertDeletes, [])
        assert.deepEqual(db.watchDeletes, [])
    })

    it("deletes the Watch when this Alert is the last one on it", async () => {
        const self = alertRow()
        db.found = foundRow([self])
        const result = await deleteYoutubeAlert(self.id)

        assert.equal(result?.alert.id, self.id)
        assert.equal(result?.alert.watchId, 11)
        assert.deepEqual(result?.alert.mentionRoleIds, [VALID_ROLE])
        assert.notEqual(result?.alert.mentionRoleIds, self.mentionRoleIds)
        assert.deepEqual(result?.alert.eventTypes, ["video"])
        assert.equal(result?.removedWatch?.id, 11)
        assert.equal(result?.removedWatch?.guildId, GUILD_ID)
        assert.equal(result?.removedWatch?.youtubeChannelId, CHANNEL_ID)
        assert.equal(result?.removedWatch?.youtubeChannelName, "LTT")

        assert.equal(db.transactionCalls, 1)
        assert.deepEqual(db.alertDeletes, [{ id: 4 }])
        assert.deepEqual(db.watchDeletes, [{ id: 11 }])
    })

    it("keeps the Watch when another Alert still remains on it", async () => {
        const self = alertRow({ id: 4 })
        const sibling = alertRow({
            id: 5,
            discordChannelId: "333333333333333333",
            eventTypes: ["short"],
        })
        db.found = foundRow([self, sibling])
        const result = await deleteYoutubeAlert(self.id)

        assert.equal(result?.alert.id, 4)
        assert.equal(result?.removedWatch, null)
        assert.equal(db.transactionCalls, 1)
        assert.deepEqual(db.alertDeletes, [{ id: 4 }])
        assert.deepEqual(db.watchDeletes, [])
    })

    it("rethrows when the delete transaction fails", async () => {
        db.found = foundRow([alertRow()])
        db.transactionThrows = true
        await assert.rejects(() => deleteYoutubeAlert(4), /connection lost/)
        assert.equal(db.transactionCalls, 1)
        assert.deepEqual(db.alertDeletes, [])
        assert.deepEqual(db.watchDeletes, [])
    })
})
