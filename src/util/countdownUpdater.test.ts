import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import {
    isUnrecoverableCountdownDiscordError,
    resetCountdownUpdaterForTests,
    shouldAnnounceCountdownFinish,
    updateAllCountdowns,
} from "./countdownUpdater.js"
import {
    initializeCountdownStore,
    removeCountdown,
    resetCountdownStoreForTests,
    setCountdownStoreDbForTests,
} from "./countdownStore.js"
import type { CountdownEntry } from "../types/index.js"
import type BotClient from "../lib/BotClient.js"

afterEach(() => {
    resetCountdownStoreForTests()
    setCountdownStoreDbForTests(null)
    resetCountdownUpdaterForTests()
})

describe("isUnrecoverableCountdownDiscordError", () => {
    it("deletes countdowns only for unknown channel/message", () => {
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 10003 }), true)
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 10008 }), true)
    })

    it("retries permission and non-numeric failures instead of wiping countdown rows", () => {
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 50001 }), false)
        assert.equal(isUnrecoverableCountdownDiscordError({ code: 50013 }), false)
        assert.equal(isUnrecoverableCountdownDiscordError({ code: "10003" }), false)
        assert.equal(isUnrecoverableCountdownDiscordError(new Error("timeout")), false)
        assert.equal(isUnrecoverableCountdownDiscordError(null), false)
    })
})

describe("shouldAnnounceCountdownFinish", () => {
    it("only announces when removeCountdown claimed the row", () => {
        assert.equal(shouldAnnounceCountdownFinish(true), true)
        assert.equal(shouldAnnounceCountdownFinish(false), false)
    })
})

describe("updateAllCountdowns serialization", () => {
    it("serializes overlapping updater passes so only one finish announce runs", async () => {
        const entry: CountdownEntry = {
            id: 42,
            guildId: "guild-a",
            channelId: "channel-1",
            messageId: "message-1",
            eventName: "Soon",
            description: null,
            imageUrl: null,
            color: null,
            footer: null,
            finishMessage: "Go!",
            mentionRoleId: "role-1",
            targetTime: new Date(Date.now() - 1000),
            createdBy: "user-1",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }

        let deleteCalls = 0
        setCountdownStoreDbForTests({
            getAllCountdownsFromDatabase: async () => ({ 42: entry }),
            deleteCountdown: async () => {
                deleteCalls++
                return true
            },
        })
        await initializeCountdownStore({ info() {} })

        const sent: string[] = []
        let releaseEdit: (() => void) | undefined
        const editGate = new Promise<void>((resolve) => {
            releaseEdit = resolve
        })

        const message = {
            edit: async () => {
                await editGate
            },
        }
        const channel = {
            messages: {
                fetch: async () => message,
            },
            isSendable: () => true,
            send: async (payload: { content?: string }) => {
                sent.push(payload.content ?? "")
            },
        }

        const client = {
            channels: {
                fetch: async () => channel,
            },
            warn() {},
        } as unknown as BotClient

        const first = updateAllCountdowns(client)
        await new Promise((r) => setImmediate(r))
        const second = updateAllCountdowns(client)

        releaseEdit!()
        await Promise.all([first, second])

        assert.equal(deleteCalls, 1)
        assert.equal(await removeCountdown(42), false)
        assert.equal(sent.length, 1)
        assert.match(sent[0]!, /Go!/)
        assert.match(sent[0]!, /role-1/)
    })
})
