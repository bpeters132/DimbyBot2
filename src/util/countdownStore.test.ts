import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { CountdownEntry, CountdownInput } from "../types/index.js"
import {
    addCountdown,
    getAllCountdowns,
    getCountdown,
    getCountdownsForGuild,
    initializeCountdownStore,
    isCountdownStoreInitialized,
    removeCountdown,
    resetCountdownStoreForTests,
    setCountdownStoreDbForTests,
} from "./countdownStore.js"

function sampleEntry(overrides: Partial<CountdownEntry> = {}): CountdownEntry {
    const targetTime = overrides.targetTime ?? new Date("2030-01-15T18:00:00.000Z")
    const createdAt = overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z")
    return {
        id: 1,
        guildId: "guild-a",
        channelId: "channel-1",
        messageId: "message-1",
        eventName: "Launch",
        description: null,
        imageUrl: null,
        color: null,
        footer: null,
        finishMessage: null,
        mentionRoleId: null,
        targetTime,
        createdBy: "user-1",
        createdAt,
        ...overrides,
    }
}

function sampleInput(overrides: Partial<CountdownInput> = {}): CountdownInput {
    const entry = sampleEntry()
    return {
        guildId: entry.guildId,
        channelId: entry.channelId,
        messageId: entry.messageId,
        eventName: entry.eventName,
        description: entry.description,
        imageUrl: entry.imageUrl,
        color: entry.color,
        footer: entry.footer,
        finishMessage: entry.finishMessage,
        mentionRoleId: entry.mentionRoleId,
        targetTime: entry.targetTime,
        createdBy: entry.createdBy,
        ...overrides,
    }
}

afterEach(() => {
    resetCountdownStoreForTests()
    setCountdownStoreDbForTests(null)
})

describe("countdownStore init guard", () => {
    it("throws before initialize and after a failed load", async () => {
        assert.equal(isCountdownStoreInitialized(), false)
        assert.throws(() => getCountdown(1), /before initialization/)
        assert.throws(() => getAllCountdowns(), /before initialization/)
        assert.throws(() => getCountdownsForGuild("guild-a"), /before initialization/)
        await assert.rejects(() => addCountdown(sampleInput()), /before initialization/)
        await assert.rejects(() => removeCountdown(1), /before initialization/)

        setCountdownStoreDbForTests({
            getAllCountdownsFromDatabase: async () => {
                throw new Error("db down")
            },
        })
        await assert.rejects(() => initializeCountdownStore({ error() {} }), /db down/)
        assert.equal(isCountdownStoreInitialized(), false)
        assert.throws(() => getCountdown(1), /before initialization/)
    })
})

describe("countdownStore clone + guild filter", () => {
    it("preserves Date fields and isolates callers from cache mutations", async () => {
        const targetTime = new Date("2030-06-01T12:00:00.000Z")
        const createdAt = new Date("2026-02-01T00:00:00.000Z")
        setCountdownStoreDbForTests({
            getAllCountdownsFromDatabase: async () => ({
                7: sampleEntry({ id: 7, guildId: "guild-a", targetTime, createdAt }),
                8: sampleEntry({ id: 8, guildId: "guild-b", eventName: "Other" }),
            }),
        })
        await initializeCountdownStore({ info() {} })

        const one = getCountdown(7)
        assert.ok(one)
        assert.ok(one.targetTime instanceof Date)
        assert.equal(one.targetTime.toISOString(), targetTime.toISOString())
        assert.ok(one.createdAt instanceof Date)

        one.eventName = "mutated"
        one.targetTime.setUTCFullYear(1999)
        assert.equal(getCountdown(7)?.eventName, "Launch")
        assert.equal(getCountdown(7)?.targetTime.toISOString(), targetTime.toISOString())

        const forGuild = getCountdownsForGuild("guild-a")
        assert.equal(forGuild.length, 1)
        assert.equal(forGuild[0]?.id, 7)
        assert.deepEqual(
            getCountdownsForGuild("missing").map((e) => e.id),
            []
        )

        const all = getAllCountdowns()
        delete all[7]
        assert.ok(getCountdown(7))
    })
})

describe("countdownStore save lock", () => {
    it("serializes concurrent add and remove against the cache", async () => {
        let nextId = 10
        const createOrder: string[] = []
        let releaseCreate: (() => void) | undefined
        const createGate = new Promise<void>((resolve) => {
            releaseCreate = resolve
        })

        setCountdownStoreDbForTests({
            getAllCountdownsFromDatabase: async () => ({
                1: sampleEntry({ id: 1 }),
            }),
            createCountdown: async (input) => {
                createOrder.push("create-start")
                await createGate
                createOrder.push("create-end")
                const id = nextId++
                return sampleEntry({
                    id,
                    guildId: input.guildId,
                    eventName: input.eventName,
                    targetTime: input.targetTime,
                })
            },
            deleteCountdown: async (id) => {
                createOrder.push(`delete-${id}`)
            },
        })
        await initializeCountdownStore({ info() {} })

        const addPromise = addCountdown(sampleInput({ eventName: "New" }))
        // Let add acquire the lock and block inside create
        await new Promise((r) => setImmediate(r))
        const removePromise = removeCountdown(1)

        releaseCreate!()
        const created = await addPromise
        await removePromise

        assert.equal(created.id, 10)
        assert.deepEqual(createOrder, ["create-start", "create-end", "delete-1"])
        assert.equal(getCountdown(10)?.eventName, "New")
        assert.equal(getCountdown(1), undefined)
    })
})
