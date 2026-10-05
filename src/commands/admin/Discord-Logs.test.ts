import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { ChannelType } from "discord.js"
import discordLogs from "./Discord-Logs.js"
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

function loadedChannel(canPost: boolean) {
    return {
        id: "log-ch",
        isTextBased: () => true,
        isSendable: () => true,
        permissionsFor: () => ({ has: () => canPost }),
    }
}

describe("discord-logs", () => {
    it("requires a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null, subcommand: "show" })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Use this command in a server."])
    })

    it("says the bot user is not ready", async () => {
        const { interaction, calls } = createSlashInteraction({ subcommand: "show" })
        await discordLogs.execute(interaction, createBotClientFake({ user: null }))
        assert.deepEqual(texts(calls), ["Bot user is not ready."])
    })

    it("asks the user to wait while settings load", async () => {
        resetGuildSettingsStoreForTests()
        const { interaction, calls } = createSlashInteraction({ subcommand: "show" })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Bot is still starting up. Please try again in a moment."])
    })

    it("says no Discord log channels are configured", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "show" })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "No Discord log channels are configured. Use `/discord-logs set` to add a channel.",
        ])
    })

    it("shows the current Discord log configuration", async () => {
        store = {
            "guild-1": {
                discordLog: { minLevel: "warn", allChannelId: "111", byLevel: { error: "222" } },
            },
        }
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "show" })
        await discordLogs.execute(interaction, createBotClientFake())
        const content = texts(calls)[0] ?? ""
        assert.match(content, /\*\*Minimum level\*\*/)
        assert.match(content, /\*\*All levels\*\*/)
        assert.match(content, /\*\*error\*\* override/)
        assert.match(content, /_Note:/)
    })

    it("reports when settings cannot be saved", async () => {
        failSave = true
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "min-level",
            options: { level: "info" },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Could not save settings to database. Check database connectivity.",
        ])
    })

    it("resets the minimum level to debug", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "min-level",
            options: { level: "default" },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Minimum Discord log level reset to **debug** (all routed severities can be sent).",
        ])
    })

    it("sets a minimum Discord log level", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "min-level",
            options: { level: "warn" },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Minimum Discord log level set to **warn** and above."])
    })

    it("says there is nothing to unset", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "unset",
            options: { target: "everything" },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Nothing to unset — Discord logging is not configured."])
    })

    it("confirms Discord log configuration was updated", async () => {
        store = { "guild-1": { discordLog: { allChannelId: "111" } } }
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "unset",
            options: { target: "all" },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Updated Discord log configuration."])
    })

    it("asks for a text or announcement channel", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            options: {
                scope: "all",
                channel: { id: "voice", type: ChannelType.GuildVoice },
            },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Choose a text or announcement channel where I can send messages.",
        ])
    })

    it("says the chosen channel could not be loaded", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            guild: { id: "guild-1", channels: { fetch: async () => null } } as {
                id: string
            },
            options: {
                scope: "all",
                channel: { id: "log-ch", type: ChannelType.GuildText },
            },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Could not load that channel or it is not a channel I can post in.",
        ])
    })

    it("lists the permissions needed in the log channel", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            guild: {
                id: "guild-1",
                channels: { fetch: async () => loadedChannel(false) },
            } as { id: string },
            options: {
                scope: "all",
                channel: { id: "log-ch", type: ChannelType.GuildText },
            },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "I need **View Channel**, **Send Messages**, and **Embed Links** in that channel.",
        ])
    })

    it("routes every severity to the chosen channel", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            guild: {
                id: "guild-1",
                channels: { fetch: async () => loadedChannel(true) },
            } as { id: string },
            options: {
                scope: "all",
                channel: { id: "log-ch", type: ChannelType.GuildText },
            },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Bot logs (per your minimum level) will use <#log-ch> for **all** severities unless a per-level route overrides.",
        ])
    })

    it("routes one severity to the chosen channel", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "set",
            guild: {
                id: "guild-1",
                channels: { fetch: async () => loadedChannel(true) },
            } as { id: string },
            options: {
                scope: "error",
                channel: { id: "log-ch", type: ChannelType.GuildText },
            },
        })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Bot **error** logs will go to <#log-ch> (other levels still use “all levels” or per-level routes if set).",
        ])
    })

    it("says the update failed when deferring throws", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({
            subcommand: "min-level",
            options: { level: "info" },
        })
        interaction.deferReply = async () => {
            throw new Error("transport")
        }
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Failed to update Discord log settings. Please try again."])
    })

    it("rejects an unknown subcommand", async () => {
        await bootSettings()
        const { interaction, calls } = createSlashInteraction({ subcommand: "nope" })
        await discordLogs.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Unknown subcommand."])
    })
})
