import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import { Collection, PermissionsBitField } from "discord.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../../../src/util/saveControlChannel.js"
import {
    cleanupControlChannel,
    createControlEmbed,
    refreshAllControlMessages,
    updateControlMessage,
} from "../../../src/events/handlers/handleControlChannel.js"

function createLoggerClient(extra: Record<string, unknown> = {}) {
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ level, args })
        }
    return {
        user: { id: "bot-1" },
        debug: log("debug"),
        info: log("info"),
        warn: log("warn"),
        error: log("error"),
        channels: { fetch: async () => null, cache: new Map() },
        lavalink: { getPlayer: () => null },
        logs,
        ...extra,
    }
}

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

describe("handleControlChannel", () => {
    it("describes an idle player", () => {
        const client = createLoggerClient()
        const embed = createControlEmbed(client as never, null, "guild-1")
        assert.equal(embed.data.description, "Nothing playing. Add a song!")
    })

    it("describes the current track", () => {
        const client = createLoggerClient()
        const player = {
            playing: true,
            queue: {
                current: {
                    info: {
                        title: "Song",
                        uri: "https://example.com/song",
                        duration: 1000,
                        isStream: false,
                        sourceName: "http",
                    },
                    requester: null,
                },
                tracks: [],
            },
            repeatMode: "off",
            get: () => false,
        }
        const embed = createControlEmbed(client as never, player as never)
        assert.equal(embed.data.description, "**Now Playing:** [Song](https://example.com/song)")
    })

    it("adds a web player link when the dashboard URL is configured", () => {
        const previous = process.env.BETTER_AUTH_URL
        process.env.BETTER_AUTH_URL = "https://dash.example"
        try {
            const client = createLoggerClient()
            const embed = createControlEmbed(client as never, null, "guild-1")
            const web = embed.data.fields?.find((field) => field.name === "Web player")
            assert.equal(
                web?.value,
                "[Open this server's dashboard](https://dash.example/dashboard/guild-1)"
            )
        } finally {
            if (previous === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = previous
        }
    })

    it("warns when cleanup lacks Manage Messages", async () => {
        const client = createLoggerClient()
        const channel = {
            id: "channel-1",
            permissionsFor: () => ({ has: () => false }),
        }
        await cleanupControlChannel(channel as never, "message-1", client as never)
        const warned = client.logs.find((entry) => entry.level === "warn")
        assert.match(String(warned?.args[0]), /Missing ManageMessages permission/)
    })

    it("logs cleanup failures", async () => {
        const client = createLoggerClient()
        const channel = {
            id: "channel-1",
            permissionsFor: () => ({
                has: (flag: unknown) => flag === PermissionsBitField.Flags.ManageMessages,
            }),
            messages: {
                fetch: async () => {
                    throw new Error("fetch failed")
                },
            },
        }
        await cleanupControlChannel(channel as never, "message-1", client as never)
        assert.equal(
            client.logs
                .at(-1)
                ?.args[0]?.toString()
                .includes("Error during control channel cleanup"),
            true
        )
        assert.equal((client.logs.at(-1)?.args[1] as Error).message, "fetch failed")
    })

    it("warns when cleanup hits an unknown message", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const client = createLoggerClient()
            const messages = new Collection<string, { id: string }>()
            messages.set("keep", { id: "keep" })
            messages.set("drop", { id: "drop" })
            const channel = {
                id: "channel-1",
                permissionsFor: () => ({
                    has: (flag: unknown) => flag === PermissionsBitField.Flags.ManageMessages,
                }),
                messages: { fetch: async () => messages },
                bulkDelete: async () => {
                    throw { code: 10008 }
                },
            }
            const pending = cleanupControlChannel(channel as never, "keep", client as never)
            await Promise.resolve()
            mock.timers.tick(5000)
            await pending
            assert.match(String(client.logs.at(-1)?.args[0]), /10008: Unknown Message/)
        } finally {
            mock.timers.reset()
        }
    })

    it("warns when the control channel cannot be fetched", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        try {
            const client = createLoggerClient()
            await updateControlMessage(client as never, "guild-1", false)
            assert.match(
                String(client.logs.find((entry) => entry.level === "warn")?.args[0]),
                /not found or not text-based/
            )
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("warns when the control message is missing", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        try {
            const client = createLoggerClient({
                channels: {
                    fetch: async () => ({
                        id: "channel-1",
                        isTextBased: () => true,
                        messages: { fetch: async () => null },
                    }),
                },
            })
            await updateControlMessage(client as never, "guild-1", false)
            assert.match(
                String(client.logs.find((entry) => entry.level === "warn")?.args[0]),
                /Control message/
            )
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("warns when editing the control message is forbidden", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        try {
            const client = createLoggerClient({
                channels: {
                    fetch: async () => ({
                        id: "channel-1",
                        isTextBased: () => true,
                        messages: {
                            fetch: async () => ({
                                id: "message-1",
                                edit: async () => {
                                    throw { code: 50013 }
                                },
                            }),
                        },
                    }),
                },
            })
            await updateControlMessage(client as never, "guild-1", false)
            assert.match(
                String(client.logs.find((entry) => entry.level === "warn")?.args[0]),
                /Code: 50013/
            )
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("logs unexpected control-message update failures", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        try {
            const client = createLoggerClient({
                channels: {
                    fetch: async () => ({
                        id: "channel-1",
                        isTextBased: () => true,
                        messages: {
                            fetch: async () => ({
                                id: "message-1",
                                edit: async () => {
                                    throw new Error("edit exploded")
                                },
                            }),
                        },
                    }),
                },
            })
            await updateControlMessage(client as never, "guild-1", false)
            const logged = client.logs.find((entry) => entry.level === "error")
            assert.equal((logged?.args[1] as Error).message, "edit exploded")
        } finally {
            resetGuildSettingsStoreForTests()
        }
    })

    it("logs when startup refresh cannot read guild settings", async () => {
        resetGuildSettingsStoreForTests()
        const client = createLoggerClient()
        await refreshAllControlMessages(client as never)
        assert.match(String(client.logs[0]?.args[0]), /getGuildSettings failed/)
    })

    it("logs how many control messages were refreshed", async () => {
        await initSettings({
            "guild-1": { controlChannelId: "channel-1", controlMessageId: "message-1" },
        })
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const client = createLoggerClient()
            const pending = refreshAllControlMessages(client as never)
            await Promise.resolve()
            mock.timers.tick(400)
            await pending
            assert.match(
                String(client.logs.find((entry) => entry.level === "info")?.args[0]),
                /Refreshing 1 control message/
            )
        } finally {
            mock.timers.reset()
            resetGuildSettingsStoreForTests()
        }
    })
})
