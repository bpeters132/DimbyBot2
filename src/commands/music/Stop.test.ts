import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import stop from "./Stop.js"
import { setPlayerSessionPersistenceDbForTests } from "../../util/playerSessionPersistence.js"
import { resolveStopCommandReply, type StopCommandReplyFlags } from "../../util/stopCommandReply.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"

const idleFlags: StopCommandReplyFlags = {
    stoppedLocal: false,
    stoppedLavalink: false,
    lavalinkIdleCleaned: false,
    lavalinkDestroyFailed: false,
    cancelledPendingLocal: false,
    localPlayerWasActive: false,
}

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

function expectStopReply(calls: RecordedMessage[], flags: StopCommandReplyFlags) {
    assert.ok(messageContents(calls).includes(resolveStopCommandReply(flags).content))
}

describe("stop", () => {
    before(() => {
        setPlayerSessionPersistenceDbForTests({
            deletePlayerSession: async () => undefined,
            upsertPlayerSession: async () => undefined,
        })
    })

    after(() => {
        setPlayerSessionPersistenceDbForTests(null)
    })

    it("tells the user to run it in a server", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: null })
        await stop.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Use this command in a server."))
    })

    it("tells the user the member profile could not be resolved", async () => {
        const { interaction, calls } = createSlashInteraction({ inCachedGuild: false })
        await stop.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("Could not resolve your member profile. Try again.")
        )
    })

    it("tells the user to join a voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({
            member: { voice: { channel: null } },
        })
        await stop.execute(interaction, createBotClientFake())
        assert.ok(messageContents(calls).includes("Join a voice channel first!"))
    })

    it("tells the user to join the bot voice channel", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild("voice-2") })
        await stop.execute(interaction, createBotClientFake())
        assert.ok(
            messageContents(calls).includes("You need to be in the same voice channel as the bot!")
        )
    })

    it("surfaces the idle stop reply when nothing is playing", async () => {
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await stop.execute(interaction, createBotClientFake())
        expectStopReply(calls, idleFlags)
    })

    it("surfaces the Lavalink stop reply when playback had content", async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] })
        const player = {
            guildId: "guild-1",
            playing: true,
            voiceChannelId: "voice-1",
            queue: { current: { info: { title: "Now" } }, tracks: [] as unknown[] },
            destroy: async () => undefined,
        }
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await stop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        expectStopReply(calls, { ...idleFlags, stoppedLavalink: true })
    })

    it("surfaces the idle-clean reply when the Lavalink player has no content", async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] })
        const player = {
            guildId: "guild-1",
            playing: false,
            voiceChannelId: "voice-1",
            queue: { current: null, tracks: [] as unknown[] },
            destroy: async () => undefined,
        }
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await stop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        expectStopReply(calls, { ...idleFlags, lavalinkIdleCleaned: true })
    })

    it("surfaces the destroy-failure reply", async () => {
        const player = {
            guildId: "guild-1",
            playing: true,
            voiceChannelId: "voice-1",
            queue: { current: { info: { title: "Now" } }, tracks: [] as unknown[] },
            destroy: async () => {
                throw new Error("destroy failed")
            },
        }
        const { interaction, calls } = createSlashInteraction({ guild: serverGuild() })
        await stop.execute(
            interaction,
            createBotClientFake({ players: new Map([["guild-1", player]]) })
        )
        expectStopReply(calls, { ...idleFlags, lavalinkDestroyFailed: true })
    })
})
