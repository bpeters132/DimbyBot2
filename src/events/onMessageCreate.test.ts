import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { MessageType } from "discord.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../util/saveControlChannel.js"
import onMessageCreate from "./onMessageCreate.js"

async function initSettings(store: Record<string, { controlChannelId?: string }>) {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests({
        getGuildSettingsStoreFromDatabase: async () => store,
        replaceGuildSettingsStoreInDatabase: async () => undefined,
    })
    await initializeGuildSettingsStore({ debug() {} })
}

function createMessageClient() {
    const listeners = new Map<string, (message: unknown) => Promise<void>>()
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ level, args })
        }
    const client = {
        error: log("error"),
        debug: log("debug"),
        warn: log("warn"),
        info: log("info"),
        user: { id: "bot-1" },
        on(event: string, cb: (message: unknown) => Promise<void>) {
            listeners.set(event, cb)
            return client
        },
        logs,
        listeners,
    }
    return client
}

describe("onMessageCreate", () => {
    it("logs when a partial message cannot be fetched", async () => {
        const client = createMessageClient()
        onMessageCreate(client as never)
        await client.listeners.get("messageCreate")?.({
            partial: true,
            fetch: async () => {
                throw new Error("unknown message")
            },
            author: { bot: false },
        })
        const logged = client.logs.find(
            (entry) => entry.args[0] === "[MessageCreate] Error fetching partial message:"
        )
        assert.equal((logged?.args[1] as Error).message, "unknown message")
    })

    it("logs and ignores direct messages", async () => {
        const client = createMessageClient()
        onMessageCreate(client as never)
        await client.listeners.get("messageCreate")?.({
            partial: false,
            author: { bot: false },
            guild: null,
            content: "hello",
        })
        assert.equal(client.logs[0]?.args[0], "[MessageCreate] Ignoring DM message.")
    })

    it("logs and ignores messages with no content", async () => {
        const client = createMessageClient()
        onMessageCreate(client as never)
        await client.listeners.get("messageCreate")?.({
            partial: false,
            author: { bot: false },
            guild: { id: "guild-1" },
            content: "",
        })
        assert.equal(client.logs[0]?.args[0], "[MessageCreate] Ignoring message with no content.")
    })

    it("logs when the control-channel handler rejects", async () => {
        await initSettings({ "guild-1": { controlChannelId: "channel-1" } })
        try {
            const client = createMessageClient()
            onMessageCreate(client as never)
            await client.listeners.get("messageCreate")?.({
                partial: false,
                type: MessageType.Default,
                author: { bot: false, id: "user-1" },
                guild: { id: "guild-1" },
                content: "play this",
                channel: {
                    id: "channel-1",
                    isTextBased() {
                        throw new Error("channel exploded")
                    },
                },
                member: { id: "user-1" },
                guildId: "guild-1",
            })
            await new Promise((resolve) => setImmediate(resolve))
            const logged = client.logs.find(
                (entry) =>
                    entry.args[0] ===
                    "[MessageCreate] Error bubbled up from control channel handler for guild guild-1:"
            )
            assert.equal((logged?.args[1] as Error).message, "channel exploded")
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })
})
