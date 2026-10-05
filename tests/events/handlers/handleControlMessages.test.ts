import assert from "node:assert/strict"
import { describe, it, mock } from "node:test"
import { MessageType, PermissionsBitField } from "discord.js"

const query = {
    impl: async (): Promise<{ success: boolean; feedbackText: string }> => ({
        success: true,
        feedbackText: "Added Song.",
    }),
}

mock.module("../../../src/util/musicManager.js", {
    namedExports: {
        handleQueryAndPlay: () => query.impl(),
    },
})

const { default: handleControlMessages } =
    await import("../../../src/events/handlers/handleControlMessages.js")

function createMessage(overrides: Record<string, unknown> = {}) {
    const sent: string[] = []
    const deleted: string[] = []
    const member = {
        id: "user-1",
        voice: { channel: voiceChannel(true) },
        toString() {
            return "<@user-1>"
        },
    }
    const channel = {
        id: "text-1",
        isTextBased: () => true,
        isDMBased: () => false,
        permissionsFor: () => ({
            has: (flag: unknown) => flag === PermissionsBitField.Flags.ManageMessages,
        }),
        async send(content: string) {
            sent.push(content)
            return {
                id: `feedback-${sent.length}`,
                async delete() {
                    deleted.push(`feedback-${sent.length}`)
                },
            }
        },
    }
    const message = {
        id: "msg-1",
        type: MessageType.Default,
        guildId: "guild-1",
        content: "never gonna",
        member,
        channel,
        guild: {
            id: "guild-1",
            members: { me: { voice: { channelId: null } } },
        },
        author: { id: "user-1" },
        async delete() {
            deleted.push("query")
        },
        sent,
        deleted,
        ...overrides,
    }
    return message
}

function voiceChannel(allow: boolean) {
    return {
        id: "voice-1",
        permissionsFor: () => ({
            has: () => allow,
        }),
    }
}

function createClient(player?: Record<string, unknown> | null) {
    const logs: Array<{ level: string; args: unknown[] }> = []
    const log =
        (level: string) =>
        (...args: unknown[]) => {
            logs.push({ level, args })
        }
    const live = player === undefined ? connectedPlayer() : player
    return {
        user: { id: "bot-1" },
        debug: log("debug"),
        info: log("info"),
        warn: log("warn"),
        error: log("error"),
        channels: { cache: new Map<string, { name?: string }>() },
        lavalink: {
            getPlayer: () => live,
            createPlayer: () => live,
            destroyPlayer: async () => undefined,
        },
        logs,
    }
}

function connectedPlayer() {
    return {
        guildId: "guild-1",
        connected: true,
        voiceChannelId: "voice-1",
        textChannelId: "text-1",
        queue: { current: null, tracks: [] },
        async connect() {},
    }
}

describe("handleControlMessages", () => {
    it("tells the user to join a voice channel", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const message = createMessage()
            message.member.voice = { channel: null }
            const client = createClient()
            await handleControlMessages(client as never, message as never)
            assert.equal(
                message.sent[0],
                "<@user-1>, you need to be in a voice channel to play music."
            )
        } finally {
            mock.timers.reset()
        }
    })

    it("tells the user the bot cannot connect or speak", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const message = createMessage()
            message.member.voice = { channel: voiceChannel(false) }
            const client = createClient()
            await handleControlMessages(client as never, message as never)
            assert.equal(
                message.sent[0],
                "<@user-1>, I need permissions to connect and speak in your voice channel."
            )
        } finally {
            mock.timers.reset()
        }
    })

    it("tells the user the bot is already in another voice channel", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const message = createMessage()
            message.guild.members.me.voice.channelId = "voice-2"
            const client = createClient()
            client.channels.cache.set("voice-2", { name: "Stage" })
            await handleControlMessages(client as never, message as never)
            assert.equal(
                message.sent[0],
                "<@user-1>, I'm already playing in another voice channel (Stage)."
            )
        } finally {
            mock.timers.reset()
        }
    })

    it("tells the user the player could not be started", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const message = createMessage()
            const client = createClient(null)
            client.lavalink.createPlayer = () => null
            await handleControlMessages(client as never, message as never)
            assert.equal(
                message.sent[0],
                "<@user-1>, Could not start the music player. Try again in a moment."
            )
        } finally {
            mock.timers.reset()
        }
    })

    it("tells the user the voice connection failed", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const message = createMessage()
            const player = connectedPlayer()
            player.connected = false
            player.connect = async () => {
                throw new Error("voice down")
            }
            const client = createClient(player)
            await handleControlMessages(client as never, message as never)
            assert.equal(message.sent[0], "<@user-1>, I couldn't connect to your voice channel.")
        } finally {
            mock.timers.reset()
        }
    })

    it("sends the playback feedback text", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        query.impl = async () => ({ success: true, feedbackText: "Queued **Song**." })
        try {
            const message = createMessage()
            const client = createClient()
            await handleControlMessages(client as never, message as never)
            assert.equal(message.sent[0], "Queued **Song**.")
        } finally {
            mock.timers.reset()
        }
    })

    it("tells the user an unexpected error occurred", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        query.impl = async () => {
            throw new Error("query exploded")
        }
        try {
            const message = createMessage()
            const client = createClient()
            await handleControlMessages(client as never, message as never)
            assert.equal(
                message.sent[0],
                "<@user-1>, An unexpected error occurred while processing your request."
            )
        } finally {
            query.impl = async () => ({ success: true, feedbackText: "Added Song." })
            mock.timers.reset()
        }
    })

    it("warns when the query message cannot be deleted", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const message = createMessage()
            message.delete = async () => {
                throw new Error("missing access")
            }
            message.member.voice = { channel: null }
            const client = createClient()
            await handleControlMessages(client as never, message as never)
            const warned = client.logs.find((entry) =>
                String(entry.args[0]).includes("Failed to delete query message")
            )
            assert.match(String(warned?.args[0]), /missing access/)
        } finally {
            mock.timers.reset()
        }
    })

    it("warns when the bot cannot delete the query message", async () => {
        mock.timers.enable({ apis: ["setTimeout"] })
        try {
            const message = createMessage()
            message.channel.permissionsFor = () => ({ has: () => false })
            message.member.voice = { channel: null }
            const client = createClient()
            await handleControlMessages(client as never, message as never)
            const warned = client.logs.find((entry) =>
                String(entry.args[0]).includes("Missing ManageMessages permission")
            )
            assert.match(String(warned?.args[0]), /cannot delete query/)
        } finally {
            mock.timers.reset()
        }
    })
})
