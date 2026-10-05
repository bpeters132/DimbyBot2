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

const queryGlobal = globalThis as { __dimbyGenreQuery?: () => Promise<QueryResult> }
queryGlobal.__dimbyGenreQuery = () => handleQuery()

registerHooks({
    load(url, context, nextLoad) {
        if (url.replaceAll("\\", "/").includes("/src/util/musicManager.ts")) {
            return {
                format: "module",
                shortCircuit: true,
                source: `
                    export function handleQueryAndPlay() {
                        return globalThis.__dimbyGenreQuery()
                    }
                `,
            }
        }
        return nextLoad(url, context)
    },
})

const { default: genre } = await import("../../../src/commands/music/Genre.js")

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

function autoplayPlayer() {
    const data = new Map<string, unknown>()
    return {
        connected: false,
        voiceChannelId: "voice-1",
        queue: { previous: [] as unknown[], current: null, tracks: [] as unknown[] },
        get: (key: string) => data.get(key),
        set: (key: string, value: unknown) => {
            data.set(key, value)
        },
    }
}

async function executeGenre(
    input: FakeInteractionInput = {},
    players = new Map<string, unknown>(),
    prepare?: (client: FakeBotClient) => void
) {
    const { interaction, calls } = createSlashInteraction({
        guild: idleGuild(),
        channel: serverChannel,
        ...input,
        options: { name: "lo-fi", ...input.options },
    })
    const client = createBotClientFake({ players })
    prepare?.(client)
    await genre.execute(interaction, client)
    return { calls, client, players }
}

describe("genre replies", () => {
    it("asks for a genre name", async () => {
        const { calls } = await executeGenre({ options: { name: "   " } })
        assert.deepEqual(messageContents(calls), ["Please provide a genre name."])
    })

    it("tells you the command is server-only", async () => {
        const { calls } = await executeGenre({ guild: null })
        assert.deepEqual(messageContents(calls), ["This command can only be used in a server."])
    })

    it("tells you when member info cannot be loaded", async () => {
        const { calls } = await executeGenre({
            inCachedGuild: false,
            guild: {
                id: "guild-1",
                members: {
                    fetch: async () => {
                        throw new Error("missing")
                    },
                },
            } as { id: string },
        })
        assert.deepEqual(messageContents(calls), [
            "Could not determine your member info—try again or re-run the command.",
        ])
    })

    it("tells you to join a voice channel", async () => {
        const { calls } = await executeGenre({ member: { voice: { channel: null } } })
        assert.deepEqual(messageContents(calls), ["Join a voice channel first!"])
    })

    it("denies genre when the bot is in another voice channel", async () => {
        const { calls } = await executeGenre({ guild: occupiedGuild("voice-2") })
        assert.deepEqual(messageContents(calls), [
            "You need to be in the same voice channel as the bot!",
        ])
    })

    it("tells you to use a server text channel", async () => {
        const { calls } = await executeGenre({
            channel: { id: "channel-1", isTextBased: () => false, isDMBased: () => false },
        })
        assert.deepEqual(messageContents(calls), ["Use this command in a server text channel."])
    })

    it("tells you when voice join fails", async () => {
        const { calls } = await executeGenre({}, new Map(), (client) => {
            const lavalink = client.lavalink as unknown as {
                createPlayer: () => Promise<unknown>
            }
            lavalink.createPlayer = async () => {
                throw new Error("voice down")
            }
        })
        assert.deepEqual(messageContents(calls), [
            "Could not join voice right now. Try again in a moment.",
        ])
    })

    it("falls back when genre search returns no feedback", async () => {
        handleQuery = async () => ({ success: false, feedbackText: "" })
        const player = autoplayPlayer()
        const { calls } = await executeGenre({}, new Map([["guild-1", player]]))
        assert.deepEqual(messageContents(calls), ["Something went wrong."])
    })

    it("tells you when the player stops before autoplay can be enabled", async () => {
        const player = autoplayPlayer()
        const players = new Map<string, unknown>([["guild-1", player]])
        handleQuery = async () => {
            players.set("guild-1", { id: "successor" })
            return { success: true, feedbackText: "" }
        }
        const { calls } = await executeGenre({}, players)
        assert.deepEqual(messageContents(calls), [
            "The player stopped before autoplay could be enabled. Try again.",
        ])
    })

    it("enables autoplay and uses the queued fallback", async () => {
        handleQuery = async () => ({ success: true })
        const player = autoplayPlayer()
        const { calls } = await executeGenre({}, new Map([["guild-1", player]]))
        assert.deepEqual(messageContents(calls), ["Autoplay enabled for **lo-fi**. Queued."])
    })

    it("enables autoplay and includes the search feedback", async () => {
        handleQuery = async () => ({ success: true, feedbackText: "Found three tracks." })
        const player = autoplayPlayer()
        const { calls } = await executeGenre(
            { options: { name: "metal" } },
            new Map([["guild-1", player]])
        )
        assert.deepEqual(messageContents(calls), [
            "Autoplay enabled for **metal**. Found three tracks.",
        ])
    })
})
