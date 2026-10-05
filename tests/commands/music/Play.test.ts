import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { describe, it } from "node:test"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type FakeBotClient,
    type FakeInteractionInput,
} from "../../test-support/commandFakes.js"

type QueryResult = { success: boolean; feedbackText?: string }

let handleQuery: () => Promise<QueryResult> = async () => {
    throw new Error("handleQueryAndPlay was not stubbed")
}

const queryGlobal = globalThis as { __dimbyPlayQuery?: () => Promise<QueryResult> }
queryGlobal.__dimbyPlayQuery = () => handleQuery()

registerHooks({
    load(url, context, nextLoad) {
        if (url.replaceAll("\\", "/").includes("/src/util/musicManager.ts")) {
            return {
                format: "module",
                shortCircuit: true,
                source: `
                    export function handleQueryAndPlay() {
                        return globalThis.__dimbyPlayQuery()
                    }
                `,
            }
        }
        return nextLoad(url, context)
    },
})

const { default: play } = await import("../../../src/commands/music/Play.js")

const serverChannel = {
    id: "channel-1",
    isTextBased: () => true,
    isDMBased: () => false,
}

function idleGuild() {
    return { id: "guild-1", members: { me: null } } as { id: string }
}

function occupiedGuild(channelId: string) {
    return {
        id: "guild-1",
        members: { me: { voice: { channelId, channel: { id: channelId } } } },
    } as { id: string }
}

async function executePlay(
    input: FakeInteractionInput = {},
    players = new Map<string, unknown>(),
    prepare?: (client: FakeBotClient) => void
) {
    const { interaction, calls } = createSlashInteraction({
        guild: idleGuild(),
        channel: serverChannel,
        ...input,
        options: { query: "song", ...input.options },
    })
    const client: FakeBotClient = createBotClientFake({ players })
    prepare?.(client)
    await play.execute(interaction, client)
    return calls
}

describe("play replies", () => {
    it("tells you to use the command in a server", async () => {
        const calls = await executePlay({ guild: null })
        assert.deepEqual(messageContents(calls), ["Use this command in a server."])
    })

    it("tells you when your member profile cannot be resolved", async () => {
        const calls = await executePlay({ inCachedGuild: false })
        assert.deepEqual(messageContents(calls), [
            "Could not resolve your member profile. Try again.",
        ])
    })

    it("tells you to join a voice channel", async () => {
        const calls = await executePlay({ member: { voice: { channel: null } } })
        assert.deepEqual(messageContents(calls), ["Join a voice channel first!"])
    })

    it("denies play when the bot is in another voice channel", async () => {
        const calls = await executePlay({ guild: occupiedGuild("voice-2") })
        assert.deepEqual(messageContents(calls), [
            "You need to be in the same voice channel as the bot!",
        ])
    })

    it("tells you to use a server text channel", async () => {
        const calls = await executePlay({
            channel: { id: "channel-1", isTextBased: () => false, isDMBased: () => false },
        })
        assert.deepEqual(messageContents(calls), ["Use this command in a server text channel."])
    })

    it("falls back when search returns no feedback", async () => {
        handleQuery = async () => ({ success: false, feedbackText: "" })
        const player = { connected: false, voiceChannelId: "voice-1" }
        const calls = await executePlay({}, new Map([["guild-1", player]]))
        assert.deepEqual(messageContents(calls), ["Something went wrong."])
    })

    it("returns the search feedback when a player already exists", async () => {
        handleQuery = async () => ({ success: true, feedbackText: "Queued the track." })
        const player = { connected: false, voiceChannelId: "voice-1" }
        const calls = await executePlay({}, new Map([["guild-1", player]]))
        assert.deepEqual(messageContents(calls), ["Queued the track."])
    })

    it("appends the web player link when it creates a player", async () => {
        handleQuery = async () => ({ success: true, feedbackText: "Queued the track." })
        const previous = process.env.BETTER_AUTH_URL
        process.env.BETTER_AUTH_URL = "https://dash.example"
        try {
            const calls = await executePlay({}, new Map(), (client) => {
                const lavalink = client.lavalink as unknown as {
                    createPlayer: () => Promise<unknown>
                }
                lavalink.createPlayer = async () => ({
                    connected: false,
                    voiceChannelId: "voice-1",
                })
            })
            assert.deepEqual(messageContents(calls), [
                "Queued the track.\n\n**Web player:** Check out the new [dashboard](https://dash.example/dashboard/guild-1) in your browser for queue and playback controls for this server!",
            ])
        } finally {
            if (previous === undefined) delete process.env.BETTER_AUTH_URL
            else process.env.BETTER_AUTH_URL = previous
        }
    })
})
