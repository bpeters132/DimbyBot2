import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import type { GuildDiscordLogSettings } from "../../src/types/index.js"
import {
    discordLogLevelAllowed,
    forwardLogToDiscordChannels,
    resolveDiscordLogChannelId,
} from "../../src/util/discordLogForward.js"
import {
    initializeGuildSettingsStore,
    resetGuildSettingsStoreForTests,
    setGuildSettingsStoreDbForTests,
} from "../../src/util/saveControlChannel.js"

describe("resolveDiscordLogChannelId", () => {
    it("prefers per-level overrides over allChannelId", () => {
        const cfg: GuildDiscordLogSettings = {
            allChannelId: "all-chan",
            byLevel: { error: "error-chan", warn: "warn-chan" },
        }
        assert.equal(resolveDiscordLogChannelId(cfg, "error"), "error-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "warn"), "warn-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "info"), "all-chan")
        assert.equal(resolveDiscordLogChannelId(cfg, "debug"), "all-chan")
    })

    it("returns null when neither per-level nor allChannelId is set", () => {
        assert.equal(resolveDiscordLogChannelId({}, "error"), null)
        assert.equal(resolveDiscordLogChannelId({ byLevel: {} }, "info"), null)
    })
})

describe("forwardLogToDiscordChannels", () => {
    const guildA = "123456789012345678"
    const guildB = "987654321098765432"
    const steered =
        `[InteractionCreate] Executing command "play" for user ada (${guildB}) ` +
        `in guild Logs (${guildB}). Query: "${guildB}". ` +
        `yt-dlp stderr: guildId=${guildB} guild=${guildB} Error: in guild ${guildB}`

    afterEach(() => {
        resetGuildSettingsStoreForTests()
        setGuildSettingsStoreDbForTests(null)
    })

    async function loadSettings() {
        setGuildSettingsStoreDbForTests({
            getGuildSettingsStoreFromDatabase: async () => ({
                [guildA]: { discordLog: { allChannelId: "chan-a" } },
                [guildB]: { discordLog: { allChannelId: "chan-b" } },
            }),
        })
        await initializeGuildSettingsStore({ debug() {}, info() {}, warn() {}, error() {} })
    }

    function recordingClient() {
        const sent: Record<string, string[]> = { [guildA]: [], [guildB]: [] }
        const makeGuild = (guildId: string, channelId: string) => {
            const channel = {
                isTextBased: () => true,
                isSendable: () => true,
                async send(payload: {
                    embeds?: Array<{ data?: { description?: string | null } }>
                }) {
                    sent[guildId].push(payload.embeds?.[0]?.data?.description ?? "")
                },
            }
            return {
                channels: {
                    cache: new Map([[channelId, channel]]),
                    fetch: async () => channel,
                },
            }
        }
        return {
            sent,
            client: {
                guilds: {
                    cache: new Map([
                        [guildA, makeGuild(guildA, "chan-a")],
                        [guildB, makeGuild(guildB, "chan-b")],
                    ]),
                },
            },
        }
    }

    it("forwards only to the explicit guild id and ignores snowflakes in the text", async () => {
        await loadSettings()
        const { client, sent } = recordingClient()
        await forwardLogToDiscordChannels(client as never, "warn", steered, guildA)
        assert.equal(sent[guildA].length, 1)
        assert.match(sent[guildA][0] ?? "", new RegExp(guildB))
        assert.equal(sent[guildB].length, 0)
    })

    it("does not forward when the guild id is missing or not a snowflake", async () => {
        await loadSettings()
        const { client, sent } = recordingClient()
        await forwardLogToDiscordChannels(client as never, "error", steered, null)
        await forwardLogToDiscordChannels(client as never, "error", steered, "not-a-snowflake")
        await forwardLogToDiscordChannels(client as never, "info", "startup", null)
        assert.equal(sent[guildA].length, 0)
        assert.equal(sent[guildB].length, 0)
    })

    it("forwards to the other guild only when that id is passed", async () => {
        await loadSettings()
        const { client, sent } = recordingClient()
        await forwardLogToDiscordChannels(client as never, "info", `guild ${guildA}`, guildB)
        assert.equal(sent[guildA].length, 0)
        assert.equal(sent[guildB].length, 1)
    })
})

describe("discordLogLevelAllowed", () => {
    it("defaults minLevel to debug (all levels allowed)", () => {
        const cfg: GuildDiscordLogSettings = {}
        assert.equal(discordLogLevelAllowed(cfg, "debug"), true)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })

    it("filters below the configured threshold and allows equal/higher", () => {
        const cfg: GuildDiscordLogSettings = { minLevel: "warn" }
        assert.equal(discordLogLevelAllowed(cfg, "debug"), false)
        assert.equal(discordLogLevelAllowed(cfg, "info"), false)
        assert.equal(discordLogLevelAllowed(cfg, "warn"), true)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })

    it("allows only error when minLevel is error", () => {
        const cfg: GuildDiscordLogSettings = { minLevel: "error" }
        assert.equal(discordLogLevelAllowed(cfg, "warn"), false)
        assert.equal(discordLogLevelAllowed(cfg, "error"), true)
    })
})
