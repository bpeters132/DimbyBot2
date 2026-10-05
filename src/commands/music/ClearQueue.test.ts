import assert from "node:assert/strict"
import { describe, it } from "node:test"
import clearQueue from "./ClearQueue.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

function serverGuild(botChannelId: string | null = "voice-1") {
    return {
        id: "guild-1",
        members: {
            fetchMe: async () => ({
                voice: { channel: botChannelId ? { id: botChannelId } : null },
            }),
        },
    } as { id: string }
}

describe("clearqueue", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await clearQueue.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await clearQueue.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await clearQueue.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user the bot is not in a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild(null) })
        await clearQueue.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("I'm not in a voice channel!"))
    })

    it("tells the user to join the bot voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild("voice-2") })
        await clearQueue.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("You must be in the same voice channel as me!"))
    })

    it("tells the user nothing is playing when there is no player", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await clearQueue.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Nothing is playing right now."))
    })

    it("tells the user the queue is already empty", async () => {
        const player = { queue: { tracks: [] as unknown[] } }
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await clearQueue.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("The queue is already empty."))
    })

    it("tells the user the player was replaced", async () => {
        const players = new Map<string, unknown>()
        const player = {
            queue: {
                tracks: {
                    get length() {
                        players.set("guild-1", { queue: { tracks: [] as unknown[] } })
                        return 2
                    },
                },
            },
        }
        players.set("guild-1", player)
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await clearQueue.execute(interaction, createBotClientFake({ players }))
        assert.ok(messageContents(calls).includes("The player was replaced. Try again."))
    })

    it("confirms how many tracks were cleared", async () => {
        const tracks = [{}, {}, {}]
        const player = {
            queue: {
                tracks,
                splice: async (start: number, size: number) => {
                    tracks.splice(start, size)
                },
            },
        }
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await clearQueue.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Cleared 3 tracks from the queue."))
    })

    it("tells the user clearing the queue failed", async () => {
        const player = {
            queue: {
                tracks: [{}, {}],
                splice: async () => {
                    throw new Error("splice failed")
                },
            },
        }
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await clearQueue.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes("An error occurred while trying to clear the queue.")
        )
    })
})
