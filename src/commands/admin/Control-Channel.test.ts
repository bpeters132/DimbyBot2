import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { ChannelType } from "discord.js"
import controlChannel from "./Control-Channel.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../../util/saveControlChannel.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"
import type { GuildSettingsStore } from "../../types/index.js"

let store: GuildSettingsStore = {}
let failSave = false

afterEach(() => {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests(null)
    store = {}
    failSave = false
})

async function bootSettings() {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests({
        getGuildSettingsStoreFromDatabase: async () => structuredClone(store),
        replaceGuildSettingsStoreInDatabase: async () => {
            if (failSave) throw new Error("db down")
            return { rowsUpserted: 1, rowsDeleted: 0, rowsAffected: 1 }
        },
    })
    await initializeGuildSettingsStore()
}

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function textChannel(input?: { hasPerms?: boolean; send?: () => Promise<unknown> }) {
    return {
        id: "channel-1",
        name: "general",
        type: ChannelType.GuildText,
        isTextBased: () => true,
        toString: () => "<#channel-1>",
        permissionsFor: () => ({
            has: () => input?.hasPerms !== false,
            toArray: () => [],
        }),
        send: input?.send ?? (async () => ({ id: "ctrl-1", delete: async () => undefined })),
    }
}

describe("control-channel", () => {
    it("requires a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null, subcommand: "set" })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Use this command in a server."])
    })

    it("requires a server text channel", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "set" })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Control channel must be a server text channel. Run this command from that channel.",
        ])
    })

    it("says the bot user is not available yet", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            channel: textChannel(),
        })
        await controlChannel.execute(interaction, createBotClientFake({ user: null }))
        assert.deepEqual(texts(calls), ["Bot user is not available yet."])
    })

    it("lists the permissions the control channel needs", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            channel: textChannel({ hasPerms: false }),
        })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "I need permissions to View Channel, Send Messages, Embed Links, and Manage Messages in the designated control channel.",
        ])
    })

    it("rolls back when settings cannot be saved", async () => {
        await bootSettings()
        failSave = true
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            channel: textChannel(),
        })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Failed to save control-channel settings to database, and the new control message was rolled back. Please fix database access and run `/control-channel set` again.",
        ])
    })

    it("reports when the control message cannot be posted", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            channel: textChannel({
                send: async () => {
                    throw new Error("cannot send")
                },
            }),
        })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Failed to create the control message. Please check my permissions in this channel.",
        ])
    })

    it("confirms the control channel was set", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            channel: textChannel(),
        })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Set <#channel-1> as the music control channel. The control message has been created.",
        ])
    })

    it("says no control channel is set", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "unset" })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["No control channel is currently set for this guild."])
    })

    it("keeps the previous channel when removal cannot be saved", async () => {
        store = { "guild-1": { controlChannelId: "old", controlMessageId: "msg" } }
        failSave = true
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "unset" })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Could not save control-channel removal to the database. The previous control channel remains configured.",
        ])
    })

    it("confirms the control channel was removed", async () => {
        store = { "guild-1": { controlChannelId: "old", controlMessageId: "msg" } }
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "unset" })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Music control channel configuration removed."])
    })

    it("rejects an unknown subcommand", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "nope" })
        await controlChannel.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Unknown or missing subcommand."])
    })
})
