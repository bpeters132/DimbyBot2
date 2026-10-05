import assert from "node:assert/strict"
import { describe, it } from "node:test"
import skip from "../../../src/commands/music/Skip.js"
import { SKIP_DEFERRED_USER_MESSAGE } from "../../../src/util/skipDeferredResult.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
} from "../../test-support/commandFakes.js"

describe("skip", () => {
    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await skip.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await skip.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await skip.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user nothing is playing", async () => {
        const { interaction, calls } = createSlashInteraction()
        await skip.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Nothing is playing."))
    })

    it("tells the user to join the bot voice channel", async () => {
        const player = {
            voiceChannelId: "voice-2",
            queue: { current: { info: { title: "Now" } }, tracks: [] as unknown[] },
        }
        const { interaction, calls } = createSlashInteraction()
        await skip.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes("You need to be in the same voice channel as the bot!")
        )
    })

    it("tells the user the player stopped before the skip finished", async () => {
        const players = new Map<string, unknown>()
        const player = {
            voiceChannelId: "voice-1",
            queue: { current: { info: { title: "Now" } }, tracks: [{}] },
            skip: async () => undefined,
        }
        players.set("guild-1", player)
        const { interaction, calls } = createSlashInteraction()
        const originalDefer = interaction.deferReply.bind(interaction)
        interaction.deferReply = (async () => {
            players.delete("guild-1")
            return originalDefer()
        }) as typeof interaction.deferReply
        await skip.execute(interaction, createBotClientFake({ players }))
        assert.ok(
            messageContents(calls).includes(
                "The player stopped before the skip finished. Try again."
            )
        )
    })

    it("surfaces the deferred skip reply", async () => {
        const player = {
            guildId: "guild-1",
            voiceChannelId: "voice-1",
            queue: {
                current: { info: { title: "Now" } },
                tracks: [
                    {
                        encoded: "",
                        info: {
                            sourceName: "youtube",
                            identifier: "dQw4w9wgxcQ",
                            uri: "https://www.youtube.com/watch?v=dQw4w9wgxcQ",
                            title: "Queued",
                        },
                    },
                ],
            },
            skip: async () => {
                throw new Error("skip should not run")
            },
        }
        const { interaction, calls } = createSlashInteraction()
        await skip.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(messageContents(calls).includes(SKIP_DEFERRED_USER_MESSAGE))
    })

    it("tells the user the skip failed", async () => {
        const player = {
            voiceChannelId: "voice-1",
            queue: { current: { info: { title: "Now" } }, tracks: [] as unknown[] },
            skip: async () => {
                throw new Error("skip failed")
            },
        }
        const { interaction, calls } = createSlashInteraction()
        await skip.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.ok(
            messageContents(calls).includes("Could not skip right now. Try again in a moment.")
        )
    })

    it("confirms the track was skipped", async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] })
        const player = {
            voiceChannelId: "voice-1",
            queue: { current: { info: { title: "Now" } }, tracks: [] as unknown[] },
            skip: async () => undefined,
        }
        const { interaction, calls } = createSlashInteraction()
        await skip.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        assert.equal(messageContents(calls).at(-1), "Skipped!")
    })
})
