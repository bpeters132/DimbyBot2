import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createSlashInteraction, messageContents } from "../test-support/commandFakes.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../util/saveControlChannel.js"
import onInteractionCreate from "./onInteractionCreate.js"

async function initSettings(
    store: Record<string, { controlChannelId?: string; controlMessageId?: string }>
) {
    resetGuildSettingsStoreForTests()
    setGuildSettingsStoreDbForTests({
        getGuildSettingsStoreFromDatabase: async () => store,
        replaceGuildSettingsStoreInDatabase: async () => undefined,
    })
    await initializeGuildSettingsStore({ debug() {} })
}

function createInteractionClient() {
    const listeners = new Map<string, (interaction: unknown) => Promise<void>>()
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ level, args })
        }
    const commands = new Map<string, { execute?: Function; autocomplete?: Function }>()
    const client = {
        error: log("error"),
        info: log("info"),
        debug: log("debug"),
        warn: log("warn"),
        commands,
        on(event: string, cb: (interaction: unknown) => Promise<void>) {
            listeners.set(event, cb)
            return client
        },
        logs,
        listeners,
    }
    return client
}

describe("onInteractionCreate", () => {
    it("replies when the chat command is unknown", async () => {
        await initSettings({})
        try {
            const client = createInteractionClient()
            onInteractionCreate(client as never)
            const { interaction, calls } = createSlashInteraction()
            ;(interaction as { commandName: string }).commandName = "missing"
            await client.listeners.get("interactionCreate")?.(interaction)
            assert.deepEqual(messageContents(calls), ['Error: Command "missing" not found!'])
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("logs when the unknown-command reply fails", async () => {
        await initSettings({})
        try {
            const client = createInteractionClient()
            onInteractionCreate(client as never)
            const { interaction } = createSlashInteraction()
            ;(interaction as { commandName: string }).commandName = "missing"
            interaction.reply = async () => {
                throw new Error("reply failed")
            }
            await client.listeners.get("interactionCreate")?.(interaction)
            const logged = client.logs.find((entry) =>
                String(entry.args[0]).includes("Failed to send 'command not found' reply")
            )
            assert.equal((logged?.args[1] as Error).message, "reply failed")
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("rejects commands used in the control channel", async () => {
        await initSettings({ "guild-1": { controlChannelId: "channel-1" } })
        try {
            const client = createInteractionClient()
            onInteractionCreate(client as never)
            const { interaction, calls } = createSlashInteraction()
            await client.listeners.get("interactionCreate")?.(interaction)
            assert.deepEqual(messageContents(calls), [
                "Commands cannot be used in the control channel.",
            ])
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("logs when the control-channel rejection reply fails", async () => {
        await initSettings({ "guild-1": { controlChannelId: "channel-1" } })
        try {
            const client = createInteractionClient()
            onInteractionCreate(client as never)
            const { interaction } = createSlashInteraction()
            interaction.reply = async () => {
                throw new Error("cannot reply")
            }
            await client.listeners.get("interactionCreate")?.(interaction)
            const logged = client.logs.find((entry) =>
                String(entry.args[0]).includes(
                    "Failed to reply when rejecting control-channel command"
                )
            )
            assert.equal((logged?.args[1] as Error).message, "cannot reply")
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("replies when guild settings cannot be loaded", async () => {
        resetGuildSettingsStoreForTests()
        const client = createInteractionClient()
        onInteractionCreate(client as never)
        const { interaction, calls } = createSlashInteraction()
        await client.listeners.get("interactionCreate")?.(interaction)
        assert.deepEqual(messageContents(calls), [
            "I could not load server settings right now. Please try again in a moment.",
        ])
    })

    it("edits the deferred reply when guild settings cannot be loaded", async () => {
        resetGuildSettingsStoreForTests()
        const client = createInteractionClient()
        onInteractionCreate(client as never)
        const { interaction, calls } = createSlashInteraction()
        ;(interaction as { deferred: boolean }).deferred = true
        await client.listeners.get("interactionCreate")?.(interaction)
        assert.deepEqual(messageContents(calls), [
            "I could not load server settings right now. Please try again in a moment.",
        ])
        assert.equal(calls[0]?.method, "editReply")
    })

    it("replies with a generic error when command execute throws", async () => {
        await initSettings({})
        try {
            const client = createInteractionClient()
            client.commands.set("test", {
                execute: async () => {
                    throw new Error("execute boom")
                },
            })
            onInteractionCreate(client as never)
            const { interaction, calls } = createSlashInteraction()
            await client.listeners.get("interactionCreate")?.(interaction)
            assert.deepEqual(messageContents(calls), [
                "There was an error executing `/test`. Please check the logs or contact the developer.",
            ])
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("edits a deferred reply when command execute throws", async () => {
        await initSettings({})
        try {
            const client = createInteractionClient()
            client.commands.set("test", {
                execute: async () => {
                    throw new Error("execute boom")
                },
            })
            onInteractionCreate(client as never)
            const { interaction, calls } = createSlashInteraction()
            ;(interaction as { deferred: boolean }).deferred = true
            await client.listeners.get("interactionCreate")?.(interaction)
            assert.equal(
                calls[0]?.content,
                "There was an error executing `/test`. Please check the logs or contact the developer."
            )
            assert.equal(calls[0]?.method, "editReply")
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("follows up when editing the deferred error reply fails", async () => {
        await initSettings({})
        try {
            const client = createInteractionClient()
            client.commands.set("test", {
                execute: async () => {
                    throw new Error("execute boom")
                },
            })
            onInteractionCreate(client as never)
            const { interaction, calls } = createSlashInteraction()
            ;(interaction as { deferred: boolean }).deferred = true
            interaction.editReply = async () => {
                throw new Error("edit failed")
            }
            await client.listeners.get("interactionCreate")?.(interaction)
            assert.equal(
                calls.at(-1)?.content,
                "There was an error executing `/test`. Please check the logs or contact the developer."
            )
            assert.equal(calls.at(-1)?.method, "followUp")
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("replies when a control button handler throws before acknowledging", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        try {
            const client = createInteractionClient()
            onInteractionCreate(client as never)
            const { interaction, calls } = createSlashInteraction()
            const button = interaction as unknown as {
                isButton: () => boolean
                isChatInputCommand: () => boolean
                customId: string
                message: { id: string }
                guild: { id: string }
                deferUpdate: () => Promise<void>
            }
            button.isButton = () => true
            button.isChatInputCommand = () => false
            button.customId = "control_play_pause"
            button.message = { id: "message-1" }
            button.guild = { id: "guild-1" }
            button.deferUpdate = async () => {
                throw new Error("defer failed")
            }
            await client.listeners.get("interactionCreate")?.(button)
            assert.deepEqual(messageContents(calls), [
                "Something went wrong with that control. Try again or use slash commands.",
            ])
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("follows up when a control button handler throws after a reply", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        try {
            const client = createInteractionClient()
            onInteractionCreate(client as never)
            const { interaction, calls } = createSlashInteraction()
            const button = interaction as unknown as {
                isButton: () => boolean
                isChatInputCommand: () => boolean
                customId: string
                message: { id: string }
                guild: { id: string }
                replied: boolean
                deferUpdate: () => Promise<void>
            }
            button.isButton = () => true
            button.isChatInputCommand = () => false
            button.customId = "control_stop"
            button.message = { id: "message-1" }
            button.guild = { id: "guild-1" }
            button.replied = true
            button.deferUpdate = async () => {
                throw new Error("defer failed")
            }
            await client.listeners.get("interactionCreate")?.(button)
            assert.equal(calls.at(-1)?.method, "followUp")
            assert.equal(
                calls.at(-1)?.content,
                "Something went wrong with that control. Try again or use slash commands."
            )
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("logs when the control-button error reply cannot be sent", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        try {
            const client = createInteractionClient()
            onInteractionCreate(client as never)
            const { interaction } = createSlashInteraction()
            const button = interaction as unknown as {
                isButton: () => boolean
                isChatInputCommand: () => boolean
                customId: string
                message: { id: string }
                guild: { id: string }
                deferUpdate: () => Promise<void>
                reply: () => Promise<void>
            }
            button.isButton = () => true
            button.isChatInputCommand = () => false
            button.customId = "control_skip"
            button.message = { id: "message-1" }
            button.guild = { id: "guild-1" }
            button.deferUpdate = async () => {
                throw new Error("defer failed")
            }
            button.reply = async () => {
                throw new Error("notify failed")
            }
            await client.listeners.get("interactionCreate")?.(button)
            const logged = client.logs.find((entry) =>
                String(entry.args[0]).includes("Failed to notify user after control button error")
            )
            assert.equal((logged?.args[1] as Error).message, "notify failed")
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("responds with no choices when an autocomplete command is missing", async () => {
        const client = createInteractionClient()
        onInteractionCreate(client as never)
        const choices: unknown[] = []
        const interaction = {
            isButton: () => false,
            isAutocomplete: () => true,
            isChatInputCommand: () => false,
            commandName: "play",
            responded: false,
            respond: async (value: unknown[]) => {
                choices.push(value)
            },
        }
        await client.listeners.get("interactionCreate")?.(interaction)
        assert.deepEqual(choices, [[]])
    })

    it("logs autocomplete failures and still responds with no choices", async () => {
        const client = createInteractionClient()
        client.commands.set("play", {
            autocomplete: async () => {
                throw new Error("suggest failed")
            },
        })
        onInteractionCreate(client as never)
        const choices: unknown[] = []
        const interaction = {
            isButton: () => false,
            isAutocomplete: () => true,
            isChatInputCommand: () => false,
            commandName: "play",
            responded: false,
            respond: async (value: unknown[]) => {
                choices.push(value)
            },
        }
        await client.listeners.get("interactionCreate")?.(interaction)
        const logged = client.logs.find((entry) =>
            String(entry.args[0]).includes("Autocomplete failed for /play")
        )
        assert.equal((logged?.args[1] as Error).message, "suggest failed")
        assert.deepEqual(choices, [[]])
    })
})
