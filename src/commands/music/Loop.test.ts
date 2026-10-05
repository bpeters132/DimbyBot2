import assert from "node:assert/strict"
import { describe, it } from "node:test"
import loop from "./Loop.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

function playingPlayer(voiceChannelId: string | null = "voice-1", playing = true) {
    return {
        voiceChannelId,
        playing,
        setRepeatMode: async () => undefined,
    }
}

describe("loop", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await loop.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await loop.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await loop.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user there is no player", async () => {
        const { interaction, calls } = createSlashInteraction()
        await loop.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("There is no player for this guild."))
    })

    it("tells the user to join the player voice channel", async () => {
        const player = playingPlayer("voice-2")
        const { interaction, calls } = createSlashInteraction()
        await loop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes(
                "You must be in the player's voice channel to change repeat mode."
            )
        )
    })

    it("tells the user nothing is playing", async () => {
        const player = playingPlayer("voice-1", false)
        const { interaction, calls } = createSlashInteraction()
        await loop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("There is nothing playing."))
    })

    it("confirms looping is disabled", async () => {
        const player = playingPlayer()
        const { interaction, calls } = createSlashInteraction({ options: { mode: "off" } })
        await loop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Looping disabled."))
    })

    it("confirms the current track is looping", async () => {
        const player = playingPlayer()
        const { interaction, calls } = createSlashInteraction({ options: { mode: "track" } })
        await loop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Now looping the current track."))
    })

    it("confirms the queue is looping", async () => {
        const player = playingPlayer()
        const { interaction, calls } = createSlashInteraction({ options: { mode: "queue" } })
        await loop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Now looping the queue."))
    })

    it("rejects an invalid loop mode", async () => {
        const player = playingPlayer()
        const { interaction, calls } = createSlashInteraction({ options: { mode: "nope" } })
        await loop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Invalid loop mode."))
    })
})
