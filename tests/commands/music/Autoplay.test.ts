import assert from "node:assert/strict"
import { describe, it } from "node:test"
import autoplay from "../../../src/commands/music/Autoplay.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

function serverGuild(botChannelId: string | null = "voice-1") {
    return {
        id: "guild-1",
        members: {
            me: {
                voice: {
                    channelId: botChannelId,
                    channel: botChannelId ? { id: botChannelId } : null,
                },
            },
        },
    } as { id: string }
}

function togglablePlayer(initial: Record<string, unknown> = {}) {
    const values = new Map<string, unknown>(Object.entries(initial))
    return {
        guildId: "guild-1",
        get(key: string) {
            return values.get(key)
        },
        set(key: string, value: unknown) {
            values.set(key, value)
        },
        queue: { tracks: [] as unknown[], previous: [] as unknown[], current: null },
    }
}

describe("autoplay", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await autoplay.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await autoplay.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await autoplay.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user there is no player", async () => {
        const { interaction, calls } = createSlashInteraction()
        await autoplay.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("There is no player for this guild."))
    })

    it("tells the user to join the bot voice channel", async () => {
        const player = togglablePlayer()
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild("voice-2") })
        await autoplay.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes("You need to be in the same voice channel as the bot!")
        )
    })

    it("confirms autoplay is enabled", async () => {
        const player = togglablePlayer()
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await autoplay.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Autoplay is now **enabled**."))
    })

    it("confirms autoplay is disabled", async () => {
        const player = togglablePlayer({ autoplay: true })
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await autoplay.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes("Autoplay is now **disabled**."))
    })
})
