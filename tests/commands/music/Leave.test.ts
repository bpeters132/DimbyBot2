import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { setPlayerSessionPersistenceDbForTests } from "../../../src/util/playerSessionPersistence.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type FakeInteractionInput,
} from "../../test-support/commandFakes.js"
import leave from "../../../src/commands/music/Leave.js"

setPlayerSessionPersistenceDbForTests({
    upsertPlayerSession: async () => undefined,
    deletePlayerSession: async () => undefined,
})

function idleGuild() {
    return { id: "guild-1", members: { me: null } } as { id: string }
}

async function withUnrefTimers(work: () => Promise<void>) {
    const original = globalThis.setTimeout
    globalThis.setTimeout = ((handler, timeout, ...args) => {
        const timer = original(handler, timeout, ...args)
        timer.unref?.()
        return timer
    }) as typeof setTimeout
    try {
        await work()
    } finally {
        globalThis.setTimeout = original
    }
}

async function executeLeave(
    input: FakeInteractionInput = {},
    players = new Map<string, unknown>()
) {
    const { interaction, calls } = createSlashInteraction({
        guild: idleGuild(),
        ...input,
    })
    Object.assign(interaction, {
        fetchReply: async () => ({
            delete: async () => undefined,
        }),
    })
    const client = createBotClientFake({ players })
    await leave.execute(interaction, client)
    return calls
}

describe("leave replies", () => {
    it("tells you to use the command in a server", async () => {
        const calls = await executeLeave({ guild: null })
        assert.deepEqual(messageContents(calls), ["Use this command in a server."])
    })

    it("tells you when your member profile cannot be resolved", async () => {
        const calls = await executeLeave({ inCachedGuild: false })
        assert.deepEqual(messageContents(calls), [
            "Could not resolve your member profile. Try again.",
        ])
    })

    it("tells you to join a voice channel", async () => {
        const calls = await executeLeave({ member: { voice: { channel: null } } })
        assert.deepEqual(messageContents(calls), ["Join a voice channel first!"])
    })

    it("denies leave when the bot is in another voice channel", async () => {
        const calls = await executeLeave({
            guild: {
                id: "guild-1",
                members: { me: { voice: { channelId: "voice-2" } } },
            } as { id: string },
        })
        assert.deepEqual(messageContents(calls), [
            "You need to be in the same voice channel as the bot!",
        ])
    })

    it("tells you when the bot is not in voice", async () => {
        const calls = await executeLeave()
        assert.deepEqual(messageContents(calls), ["I'm not in a voice channel!"])
    })

    it("confirms it left when the bot was in voice without a Lavalink player", async () => {
        await withUnrefTimers(async () => {
            const calls = await executeLeave({
                guild: {
                    id: "guild-1",
                    members: {
                        me: {
                            voice: {
                                channel: { id: "voice-1" },
                                disconnect: async () => undefined,
                            },
                        },
                    },
                } as { id: string },
            })
            assert.deepEqual(messageContents(calls), ["Left the voice channel."])
        })
    })

    it("asks you to disconnect the bot when leave fails without a player", async () => {
        const calls = await executeLeave({
            guild: {
                id: "guild-1",
                members: {
                    me: {
                        voice: {
                            channel: { id: "voice-1" },
                            disconnect: async () => {
                                throw new Error("discord down")
                            },
                        },
                    },
                },
            } as { id: string },
        })
        assert.deepEqual(messageContents(calls), [
            "Couldn't leave the channel cleanly. Please disconnect me manually.",
        ])
    })

    it("says bye after destroying the player", async () => {
        const player = {
            connected: true,
            playing: false,
            destroy: async () => undefined,
        }
        await withUnrefTimers(async () => {
            const calls = await executeLeave({}, new Map([["guild-1", player]]))
            assert.deepEqual(messageContents(calls), ["BYE!"])
        })
    })

    it("tells you when destroying the player fails", async () => {
        const player = {
            connected: true,
            playing: false,
            destroy: async () => {
                throw new Error("destroy failed")
            },
        }
        const calls = await executeLeave({}, new Map([["guild-1", player]]))
        assert.deepEqual(messageContents(calls), ["An error occurred while trying to leave."])
    })
})
