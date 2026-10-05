import assert from "node:assert/strict"
import { describe, it } from "node:test"
import shuffle from "./Shuffle.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

describe("shuffle", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await shuffle.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await shuffle.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await shuffle.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user to join the bot voice channel", async () => {
        const player = {
            voiceChannelId: "voice-2",
            queue: { current: null, tracks: [] as unknown[] },
        }
        const { interaction, calls } = createSlashInteraction()
        await shuffle.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes(
                "You must be in the same voice channel as the bot to use this command."
            )
        )
    })

    it("tells the user nothing is playing", async () => {
        const { interaction, calls } = createSlashInteraction()
        await shuffle.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Nothing is playing."))
    })

    it("tells the user the last song is already playing", async () => {
        const player = {
            voiceChannelId: "voice-1",
            queue: { current: { info: { title: "Only" } }, tracks: [] as unknown[] },
        }
        const { interaction, calls } = createSlashInteraction()
        await shuffle.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("The last song in the queue is already playing!"))
    })

    it("tells the user the player was replaced", async () => {
        const players = new Map<string, unknown>()
        const player = {
            voiceChannelId: "voice-1",
            queue: {
                current: { info: { title: "Now" } },
                tracks: {
                    get length() {
                        players.set("guild-1", {})
                        return 2
                    },
                },
            },
        }
        players.set("guild-1", player)
        const { interaction, calls } = createSlashInteraction()
        await shuffle.execute(interaction, createBotClientFake({ players }))
        assert.ok(messageContents(calls).includes("The player was replaced. Try again."))
    })

    it("tells the user there are not enough songs to shuffle", async () => {
        const player = {
            voiceChannelId: "voice-1",
            queue: {
                current: { info: { title: "Now" } },
                tracks: [{}],
            },
        }
        const { interaction, calls } = createSlashInteraction()
        await shuffle.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Not enough songs in the queue to shuffle."))
    })

    it("confirms the queue was shuffled", async () => {
        const tracks = [{}, {}]
        const player = {
            voiceChannelId: "voice-1",
            queue: {
                current: { info: { title: "Now" } },
                tracks,
                shuffle: async () => undefined,
            },
        }
        const { interaction, calls } = createSlashInteraction()
        await shuffle.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.equal(messageContents(calls).at(-1), "Queue shuffled.")
    })
})
