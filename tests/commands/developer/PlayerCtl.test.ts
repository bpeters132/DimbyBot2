import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { afterEach, describe, it } from "node:test"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"
import type { ChatInputCommandInteraction } from "discord.js"

const OWNER = "owner-1"
const GUILD = "guild-9"
const previousOwner = process.env.OWNER_ID

type SkipGlobals = typeof globalThis & { __upcomingResult?: string }
const g = globalThis as SkipGlobals

registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ?? ""
        if (
            specifier.endsWith("youtubePlaybackWindow.js") &&
            parent.includes("skipCurrentTrack.ts")
        ) {
            return {
                url: "data:text/javascript," + encodeURIComponent(playbackSource),
                shortCircuit: true,
            }
        }
        return nextResolve(specifier, context)
    },
})

const playbackSource = `
export async function ensureUpcomingHeadPlayable() {
    return globalThis.__upcomingResult ?? "empty"
}
`

const { default: playerCtl } = await import("../../../src/commands/developer/PlayerCtl.js")

afterEach(() => {
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
    delete g.__upcomingResult
})

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function embedTitle(calls: RecordedMessage[]): string | undefined {
    for (const call of calls) {
        const embed = call.embeds?.[0] as
            | { data?: { title?: string; fields?: { name: string; value: string }[] } }
            | undefined
        if (embed?.data) return embed.data.title
    }
    return undefined
}

function embedField(calls: RecordedMessage[], name: string): string | undefined {
    for (const call of calls) {
        const embed = call.embeds?.[0] as
            | { data?: { fields?: { name: string; value: string }[] } }
            | undefined
        const field = embed?.data?.fields?.find((row) => row.name === name)
        if (field) return field.value
    }
    return undefined
}

function player(overrides: Record<string, unknown> = {}) {
    return {
        guildId: GUILD,
        connected: true,
        playing: false,
        paused: false,
        volume: 40,
        repeatMode: "off",
        voiceChannelId: "vc-1",
        textChannelId: "tc-1",
        position: 0,
        node: { id: "node-1" },
        queue: { current: null, tracks: [] as unknown[] },
        skip: async () => undefined,
        stopPlaying: async () => undefined,
        destroy: async () => undefined,
        ...overrides,
    }
}

function dropPlayerOnDefer(
    interaction: ChatInputCommandInteraction,
    players: Map<string, unknown>
) {
    const original = interaction.deferReply.bind(interaction)
    interaction.deferReply = (async () => {
        players.delete(GUILD)
        return original()
    }) as ChatInputCommandInteraction["deferReply"]
}

describe("playerctl", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction({
            subcommand: "view",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: "someone-else",
            subcommand: "view",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("says no player is active", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "view",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [`❌ No active player found for Guild ID: ${GUILD}`])
    })

    it("shows player status when nothing is playing", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const guilds = new Map<string, unknown>([[GUILD, { name: "Radio" }]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "view",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players, guilds }))
        assert.equal(embedTitle(calls), `Player Status: Radio (${GUILD})`)
        assert.equal(embedField(calls, "Current Track"), "Nothing playing")
        assert.equal(embedField(calls, "Playing"), "No")
        assert.equal(embedField(calls, "Connected"), "Yes")
    })

    it("says the player was replaced before skip finished", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "skip",
            options: { guildid: GUILD },
        })
        dropPlayerOnDefer(interaction, players)
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [
            `❌ Player for Guild ID ${GUILD} stopped or was replaced before skip finished.`,
        ])
    })

    it("says nothing is playing in that guild", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "skip",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), ["❌ Nothing is currently playing in that guild."])
    })

    it("says the next track is still preparing", async () => {
        process.env.OWNER_ID = OWNER
        g.__upcomingResult = "deferred"
        const current = player({
            queue: {
                current: { info: { title: "Song", uri: "https://example.com", duration: 1 } },
                tracks: [],
            },
        })
        const players = new Map<string, unknown>([[GUILD, current]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "skip",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [
            `❌ Could not skip in Guild ID ${GUILD}; the next track is still preparing.`,
        ])
    })

    it("confirms a force skip", async () => {
        process.env.OWNER_ID = OWNER
        const current = player({
            queue: {
                current: { info: { title: "Song", uri: "https://example.com", duration: 1 } },
                tracks: [],
            },
        })
        const players = new Map<string, unknown>([[GUILD, current]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "skip",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [`✅ Force-skipped track in Guild ID: ${GUILD}`])
    })

    it("says the player was replaced before stop finished", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "stop",
            options: { guildid: GUILD },
        })
        dropPlayerOnDefer(interaction, players)
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [
            `❌ Player for Guild ID ${GUILD} stopped or was replaced before stop finished.`,
        ])
    })

    it("confirms the player was stopped", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "stop",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [
            `✅ Stopped player and cleared queue in Guild ID: ${GUILD}`,
        ])
    })

    it("says the player was replaced before destroy finished", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "destroy",
            options: { guildid: GUILD },
        })
        dropPlayerOnDefer(interaction, players)
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [
            `❌ Player for Guild ID ${GUILD} stopped or was replaced before destroy finished.`,
        ])
    })

    it("confirms the player was destroyed", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "destroy",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [`✅ Destroyed player instance for Guild ID: ${GUILD}`])
    })

    it("says the player was replaced before reconnect finished", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "reconnect",
            options: { guildid: GUILD },
        })
        dropPlayerOnDefer(interaction, players)
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [
            `❌ Player for Guild ID ${GUILD} stopped or was replaced before reconnect finished.`,
        ])
    })

    it("says the player has no voice channel id", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player({ voiceChannelId: null })]])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "reconnect",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), ["❌ Player has no voice channel id; cannot reconnect."])
    })

    it("says the voice channel is missing", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const client = createBotClientFake({ players })
        const raw = client as unknown as { channels: { fetch: (id: string) => Promise<unknown> } }
        raw.channels.fetch = async () => {
            throw { code: 10003 }
        }
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "reconnect",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, client)
        assert.deepEqual(texts(calls), ["❌ Voice channel vc-1 is missing or not voice-based."])
    })

    it("confirms the voice channel was rejoined", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([[GUILD, player()]])
        const client = createBotClientFake({ players })
        const raw = client as unknown as { channels: { fetch: (id: string) => Promise<unknown> } }
        raw.channels.fetch = async () => ({ id: "vc-1", isVoiceBased: () => true })
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "reconnect",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, client)
        assert.deepEqual(texts(calls), [
            `✅ Rejoined voice channel for Guild ID: ${GUILD} (queue unchanged).`,
        ])
    })

    it("reports an unexpected command error", async () => {
        process.env.OWNER_ID = OWNER
        const players = new Map<string, unknown>([
            [
                GUILD,
                player({
                    stopPlaying: async () => {
                        throw new Error("boom")
                    },
                }),
            ],
        ])
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "stop",
            options: { guildid: GUILD },
        })
        await playerCtl.execute(interaction, createBotClientFake({ players }))
        assert.deepEqual(texts(calls), [
            `❌ An error occurred while executing the command for Guild ID ${GUILD}. Check console. Error: boom`,
        ])
    })
})
