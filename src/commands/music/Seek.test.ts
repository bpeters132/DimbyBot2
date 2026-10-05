import assert from "node:assert/strict"
import { describe, it } from "node:test"
import seek from "./Seek.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

function playerWithCurrent(voiceChannelId: string | null, duration = 60_000) {
    return {
        voiceChannelId,
        queue: {
            current: { info: { duration } },
        },
        seek: async () => undefined,
    }
}

describe("seek", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({
            guild: null,
            options: { position: 1 },
        })
        await seek.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({
            inCachedGuild: false,
            options: { position: 1 },
        })
        await seek.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
            options: { position: 1 },
        })
        await seek.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user nothing is playing", async () => {
        const { interaction, calls } = createSlashInteraction({ options: { position: 1 } })
        await seek.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Nothing is playing."))
    })

    it("tells the user to join the bot voice channel", async () => {
        const player = playerWithCurrent("voice-2")
        const { interaction, calls } = createSlashInteraction({ options: { position: 1 } })
        await seek.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes("You need to be in the same voice channel as the bot!")
        )
    })

    it("rejects a position past the end of the track", async () => {
        const player = playerWithCurrent("voice-1", 10_000)
        const { interaction, calls } = createSlashInteraction({ options: { position: 30 } })
        await seek.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes("That position is past the end of the track (~10s).")
        )
    })

    it("confirms the seek completed", async () => {
        const player = playerWithCurrent("voice-1", 60_000)
        const { interaction, calls } = createSlashInteraction({ options: { position: 12 } })
        await seek.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.equal(messageContents(calls).at(-1), "Seek complete.")
    })
})
