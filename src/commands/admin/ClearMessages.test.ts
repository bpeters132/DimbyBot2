import assert from "node:assert/strict"
import { describe, it } from "node:test"
import clearMessages from "./ClearMessages.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

function bulkChannel(fetchImpl: () => Promise<unknown>) {
    return {
        id: "channel-1",
        isTextBased: () => true,
        messages: { fetch: fetchImpl },
        bulkDelete: async () => undefined,
    }
}

function texts(calls: Parameters<typeof messageContents>[0]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

describe("clearmessages", () => {
    it("refuses channels that cannot bulk delete", async () => {
        const { interaction, calls } = createSlashInteraction()
        await clearMessages.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Use this command in a server text channel where bulk delete is available.",
        ])
    })

    it("rejects a count outside 1 to 30", async () => {
        const { interaction, calls } = createSlashInteraction({
            channel: bulkChannel(async () => ({ filter: () => ({ size: 0 }) })),
            options: { count: 0 },
        })
        await clearMessages.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Count must be between 1 and 30 messages."])
    })

    it("reports how many messages were cleared", async () => {
        const { interaction, calls } = createSlashInteraction({
            channel: bulkChannel(async () => ({
                filter: (fn: (message: { interaction?: unknown }) => boolean) => {
                    const kept = [{}, { interaction: { id: "1" } }].filter(fn)
                    return { size: kept.length }
                },
            })),
            options: { count: 2 },
        })
        await clearMessages.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Cleared 1 messages!"])
    })

    it("explains when nothing can be bulk deleted", async () => {
        const { interaction, calls } = createSlashInteraction({
            channel: bulkChannel(async () => ({ filter: () => ({ size: 0 }) })),
            options: { count: 2 },
        })
        await clearMessages.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "No deletable messages found (or only the command itself). Messages older than 14 days or other interaction replies cannot be bulk deleted.",
        ])
    })

    it("reports a bulk-delete failure", async () => {
        const { interaction, calls } = createSlashInteraction({
            channel: bulkChannel(async () => {
                throw new Error("missing permission")
            }),
            options: { count: 2 },
        })
        await clearMessages.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "An error occurred while clearing messages. Ensure the bot has Manage Messages permission and messages are not older than 14 days.",
        ])
    })
})
